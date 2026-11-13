import type {
  Evidence,
  EvidenceWriteError,
  ProvenanceError,
  RunLog,
  TransformError,
  UnknownCatalogEntry,
} from "@viokit/schema";
import {
  AddEntity,
  AddedEntity,
  Entity,
  ExpandRequest,
  entityId,
  Identifier,
  NonEmptyEvidenceIds,
  type RunNode,
  type RunOutcome,
  RunRecord,
  SEED_TRANSFORM,
  SkippedTransform,
  SpatialExtent,
  Step,
  type StopReason,
  stepId,
  TemporalExtent,
  type ToolKind,
  TREE_DEFAULTS,
  TreeError,
  type TreeNode,
  TreeSummary,
} from "@viokit/schema";
import { Effect } from "effect";
import { fnv1aHex } from "./hash.js";

/**
 * The investigation tree. Starting from one seed it runs every applicable
 * transform on every entity it finds, under caps, and records each run so the
 * tree can be read back.
 *
 * It runs transforms and commits steps only through the port it is given, which
 * the engine builds from its own public operations (I8). Nothing here touches
 * the network, the graph store or a process.
 */

export interface TreeTransform {
  readonly accepts: { readonly field: string; readonly kind: string };
  readonly id: string;
  readonly sourceId: string;
  readonly toolKind: ToolKind;
}

export interface SourceStatus {
  readonly reason?: string | undefined;
  readonly runnable: boolean;
}

export interface TreePort {
  /** Records the seed as evidence, attributed to the caller. */
  readonly ingestSeed: (
    bytes: Uint8Array
  ) => Effect.Effect<Evidence, EvidenceWriteError>;
  readonly insert: (step: Step) => Effect.Effect<Step, ProvenanceError>;
  readonly investigation: Effect.Effect<string>;
  readonly nowMs: Effect.Effect<number>;
  readonly run: (
    transformId: string,
    input: unknown
  ) => Effect.Effect<readonly Step[], TransformError | UnknownCatalogEntry>;
  readonly runLog: RunLog;
  readonly sourceStatus: (sourceId: string) => Effect.Effect<SourceStatus>;
  readonly transforms: readonly TreeTransform[];
}

interface Known {
  readonly depth: number;
  readonly id: string;
  readonly kind: string;
  readonly value: string;
}

const encode = new TextEncoder();
/** Domains and addresses use their plain value as the entity id; other kinds are prefixed. */
const PLAIN_ID_KINDS = new Set(["domain", "ip-address"]);

const idFor = (kind: string, value: string): string =>
  PLAIN_ID_KINDS.has(kind) ? value : `${kind}:${value}`;

const identifierKindFor = (kind: string, value: string): string => {
  if (kind === "ip-address") {
    return value.includes(":") ? "ipv6" : "ipv4";
  }
  return kind;
};

const unbounded = TemporalExtent.make({
  validFrom: new Date(0),
  validTo: new Date("9999-12-31T00:00:00.000Z"),
});

const messageOf = (cause: unknown): string => {
  const maybe = cause as { readonly message?: unknown } | null;
  return typeof maybe?.message === "string" ? maybe.message : String(cause);
};

const sortById = <T extends { readonly id: string }>(items: readonly T[]) =>
  [...items].sort((left, right) => left.id.localeCompare(right.id));

interface Limits {
  readonly kinds: readonly ToolKind[];
  readonly maxDepth: number;
  readonly maxEntities: number;
  readonly maxMs: number;
  readonly maxRuns: number;
}

/** Mutable state of one expansion, kept together so helpers stay small. */
interface Expansion {
  readonly done: Set<string>;
  failed: number;
  readonly investigation: string;
  readonly known: Map<string, Known>;
  readonly limits: Limits;
  readonly port: TreePort;
  runs: number;
  readonly skipped: Map<string, string>;
  readonly startedAt: number;
  readonly usable: readonly TreeTransform[];
}

const limitsOf = (request: ExpandRequest): Limits => ({
  kinds: request.kinds ?? TREE_DEFAULTS.kinds,
  maxDepth: request.maxDepth ?? TREE_DEFAULTS.maxDepth,
  maxEntities: request.maxEntities ?? TREE_DEFAULTS.maxEntities,
  maxMs: request.maxMs ?? TREE_DEFAULTS.maxMs,
  maxRuns: request.maxRuns ?? TREE_DEFAULTS.maxRuns,
});

/** Records the seed as evidence, then adds the seed entity with that evidence (I2). */
const recordSeed = (
  port: TreePort,
  request: ExpandRequest,
  seedId: string
): Effect.Effect<void, EvidenceWriteError | ProvenanceError> =>
  Effect.gen(function* () {
    const evidence = yield* port.ingestSeed(
      encode.encode(
        JSON.stringify({ kind: request.seedKind, value: request.seedValue })
      )
    );
    yield* port.insert(
      Step.make({
        evidenceIds: NonEmptyEvidenceIds.make([evidence.id]),
        id: stepId(fnv1aHex(encode.encode(`seed:${evidence.id}`))),
        operation: AddEntity.make({
          entity: Entity.make({
            id: entityId(seedId),
            identifiers: [
              Identifier.make({
                kind: identifierKindFor(request.seedKind, request.seedValue),
                value: request.seedValue,
              }),
            ],
            kind: request.seedKind,
            spatialExtent: SpatialExtent.make({ lat: 0, lon: 0 }),
            temporalExtent: unbounded,
          }),
        }),
      })
    );
  });

/** Transforms that cannot run are skipped once, up front, with the reason. */
const classify = (
  port: TreePort,
  kinds: readonly ToolKind[]
): Effect.Effect<Map<string, string>> =>
  Effect.gen(function* () {
    const skipped = new Map<string, string>();
    for (const transform of port.transforms) {
      const status = yield* port.sourceStatus(transform.sourceId);
      if (!status.runnable) {
        skipped.set(
          transform.id,
          `source '${transform.sourceId}' is not runnable: ${status.reason ?? "no reason given"}`
        );
      } else if (!kinds.includes(transform.toolKind)) {
        skipped.set(
          transform.id,
          `policy: ${transform.toolKind} tools are excluded`
        );
      }
    }
    return skipped;
  });

const applicableTo = (state: Expansion, kind: string) =>
  sortById(state.usable.filter((one) => one.accepts.kind === kind));

const capReached = (state: Expansion): Effect.Effect<StopReason | undefined> =>
  Effect.gen(function* () {
    if (state.runs >= state.limits.maxRuns) {
      return "runs";
    }
    if (state.known.size >= state.limits.maxEntities) {
      return "entities";
    }
    const now = yield* state.port.nowMs;
    return now - state.startedAt >= state.limits.maxMs ? "time" : undefined;
  });

interface Additions {
  readonly added: readonly AddedEntity[];
  readonly relations: number;
}

/** Folds a run's committed steps into the known set; returns what was new. */
const absorb = (
  state: Expansion,
  steps: readonly Step[],
  depth: number
): Additions => {
  const added: AddedEntity[] = [];
  let relations = 0;
  for (const { operation } of steps) {
    if (operation._tag === "AddRelation") {
      relations += 1;
    } else if (operation._tag === "AddEntity") {
      const found = operation.entity;
      if (!state.known.has(found.id)) {
        state.known.set(found.id, {
          depth: depth + 1,
          id: found.id,
          kind: found.kind,
          value: found.identifiers[0]?.value ?? found.id,
        });
        added.push(AddedEntity.make({ id: found.id, kind: found.kind }));
      }
    }
  }
  return { added, relations };
};

const outcomeOf = (
  result:
    | { readonly _tag: "Success"; readonly success: readonly Step[] }
    | { readonly _tag: "Failure" }
): RunOutcome => {
  if (result._tag === "Failure") {
    return "failed";
  }
  return result.success.length === 0 ? "empty" : "ok";
};

/** Runs one (entity, transform) pair, commits its steps, and records the run. */
const runPair = (
  state: Expansion,
  entity: Known,
  transform: TreeTransform
): Effect.Effect<void, ProvenanceError> =>
  Effect.gen(function* () {
    const { port } = state;
    state.done.add(`${entity.id}|${transform.id}`);
    state.runs += 1;
    const runNumber = state.runs;
    const began = yield* port.nowMs;
    const result = yield* Effect.result(
      Effect.gen(function* () {
        const steps = yield* port.run(transform.id, {
          [transform.accepts.field]: entity.value,
        });
        for (const step of steps) {
          yield* port.insert(step);
        }
        return steps;
      })
    );
    const finished = yield* port.nowMs;
    const additions =
      result._tag === "Success"
        ? absorb(state, result.success, entity.depth)
        : { added: [], relations: 0 };
    if (result._tag === "Failure") {
      state.failed += 1;
    }
    yield* port.runLog.append(
      state.investigation,
      RunRecord.make({
        addedEntities: additions.added,
        addedRelationCount: additions.relations,
        depth: entity.depth,
        durationMs: finished - began,
        inputEntityId: entity.id,
        inputKind: entity.kind,
        ...(result._tag === "Failure"
          ? { message: messageOf(result.failure) }
          : {}),
        outcome: outcomeOf(result),
        runId: `${state.investigation}#${runNumber}`,
        startedAt: new Date(began).toISOString(),
        transformId: transform.id,
      })
    );
  });

/** One level, breadth first. Returns the cap that stopped it, if any. */
const runLevel = (
  state: Expansion,
  depth: number
): Effect.Effect<StopReason | undefined, ProvenanceError> =>
  Effect.gen(function* () {
    const level = sortById(
      [...state.known.values()].filter((one) => one.depth === depth)
    );
    for (const entity of level) {
      for (const transform of applicableTo(state, entity.kind)) {
        // No repeat check: each entity is visited once, at its own depth, so a
        // pair cannot come round twice. `done` records them for the depth stop.
        const stop = yield* capReached(state);
        if (stop !== undefined) {
          return stop;
        }
        yield* runPair(state, entity, transform);
      }
    }
  });

/** Entities at the depth limit that a transform could still run on mean the depth cap ended it. */
const finalStop = (state: Expansion): StopReason => {
  const atLimit = [...state.known.values()].filter(
    (one) => one.depth === state.limits.maxDepth
  );
  const unexplored = atLimit.some((one) =>
    applicableTo(state, one.kind).some(
      (t) => !state.done.has(`${one.id}|${t.id}`)
    )
  );
  return unexplored ? "depth" : "exhausted";
};

const summarize = (
  state: Expansion,
  stop: StopReason,
  finishedAt: number
): TreeSummary => {
  const byKind: Record<string, number> = {};
  for (const one of state.known.values()) {
    byKind[one.kind] = (byKind[one.kind] ?? 0) + 1;
  }
  return TreeSummary.make({
    elapsedMs: finishedAt - state.startedAt,
    entities: state.known.size,
    entitiesByKind: byKind,
    failed: state.failed,
    runs: state.runs,
    skipped: [...state.skipped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([transformId, reason]) =>
        SkippedTransform.make({ reason, transformId })
      ),
    stoppedBecause: stop,
  });
};

const validateSeed = (
  port: TreePort,
  request: ExpandRequest
): Effect.Effect<void, TreeError> => {
  if (request.seedValue.trim() === "") {
    return Effect.fail(new TreeError({ message: "the seed has no value" }));
  }
  if (!port.transforms.some((one) => one.accepts.kind === request.seedKind)) {
    return Effect.fail(
      new TreeError({
        message: `no transform accepts a seed of kind '${request.seedKind}'`,
      })
    );
  }
  return Effect.void;
};

const startState = (
  port: TreePort,
  request: ExpandRequest,
  seedId: string
): Effect.Effect<Expansion> =>
  Effect.gen(function* () {
    const limits = limitsOf(request);
    const skipped = yield* classify(port, limits.kinds);
    return {
      done: new Set<string>(),
      failed: 0,
      investigation: yield* port.investigation,
      known: new Map<string, Known>([
        [
          seedId,
          {
            depth: 0,
            id: seedId,
            kind: request.seedKind,
            value: request.seedValue,
          },
        ],
      ]),
      limits,
      port,
      runs: 0,
      skipped,
      startedAt: yield* port.nowMs,
      usable: port.transforms.filter((one) => !skipped.has(one.id)),
    };
  });

export const expand = (
  port: TreePort,
  input: ExpandRequest
): Effect.Effect<
  TreeSummary,
  TreeError | EvidenceWriteError | ProvenanceError
> =>
  Effect.gen(function* () {
    const request = ExpandRequest.make(input);
    yield* validateSeed(port, request);
    const seedId = idFor(request.seedKind, request.seedValue);
    const state = yield* startState(port, request, seedId);
    yield* recordSeed(port, request, seedId);
    yield* port.runLog.append(
      state.investigation,
      RunRecord.make({
        addedEntities: [
          AddedEntity.make({ id: seedId, kind: request.seedKind }),
        ],
        addedRelationCount: 0,
        depth: 0,
        durationMs: 0,
        inputEntityId: seedId,
        inputKind: request.seedKind,
        outcome: "ok",
        runId: `${state.investigation}#0`,
        startedAt: new Date(state.startedAt).toISOString(),
        transformId: SEED_TRANSFORM,
      })
    );

    let stop: StopReason | undefined;
    for (
      let depth = 0;
      depth < state.limits.maxDepth && stop === undefined;
      depth += 1
    ) {
      const hasLevel = [...state.known.values()].some(
        (one) => one.depth === depth
      );
      if (!hasLevel) {
        break;
      }
      stop = yield* runLevel(state, depth);
    }
    return summarize(state, stop ?? finalStop(state), yield* port.nowMs);
  });

/**
 * Reads the tree back from the run records: each entity with the runs applied
 * to it, each run with the entities it discovered. An entity appears once, under
 * the run that first found it, so the structure is always a tree.
 */
export const readTree = (
  port: Pick<TreePort, "investigation" | "runLog">
): Effect.Effect<readonly TreeNode[]> =>
  Effect.gen(function* () {
    const investigation = yield* port.investigation;
    const records = yield* port.runLog.list(investigation);
    const runsByInput = new Map<string, RunRecord[]>();
    for (const record of records) {
      if (record.transformId === SEED_TRANSFORM) {
        continue;
      }
      const existing = runsByInput.get(record.inputEntityId) ?? [];
      runsByInput.set(record.inputEntityId, [...existing, record]);
    }
    const nodeFor = (id: string, kind: string): TreeNode => ({
      entityId: id,
      kind,
      runs: (runsByInput.get(id) ?? []).map(
        (run): RunNode => ({
          children: run.addedEntities.map((child) =>
            nodeFor(child.id, child.kind)
          ),
          durationMs: run.durationMs,
          message: run.message,
          outcome: run.outcome,
          runId: run.runId,
          transformId: run.transformId,
        })
      ),
    });
    return records
      .filter((record) => record.transformId === SEED_TRANSFORM)
      .flatMap((record) => record.addedEntities)
      .map((seed) => nodeFor(seed.id, seed.kind));
  });
