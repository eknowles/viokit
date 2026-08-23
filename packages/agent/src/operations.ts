import type { Engine } from "@viokit/engine";
import { Engine as EngineTag } from "@viokit/engine";
import {
  CatalogFilter,
  defaultInvestigation,
  EvidenceInput,
  evidenceId,
  GraphState,
  localUser,
  Manual,
  MatchRule,
  reviveJsonDates,
  Step,
  ViewStateDocument,
  ViewStateKey,
} from "@viokit/schema";
import { Effect, Option, Schema } from "effect";

/**
 * The one operation table both front-ends are built from. Front-ends map this
 * table onto their protocol and contribute nothing else (I8) — so anything the
 * MCP surface can do, the CLI can do identically, and neither can reach the
 * graph, evidence, or the network except through `Engine`.
 *
 * Wire shapes here are deliberately thin (ids, filters, JSON payloads). They
 * are not authoritative: every payload is decoded against the shared schema in
 * this table before it reaches the engine (I6), and the rich, language-neutral
 * contract a caller needs comes from `catalog_describe` (TDR-016).
 */

/** How one argument arrives over a front-end boundary. */
export type ArgKind = "string" | "number" | "boolean" | "json";

export interface ArgSpec {
  readonly description: string;
  readonly kind: ArgKind;
  readonly name: string;
  readonly optional: boolean;
}

export interface AgentOperation {
  readonly args: readonly ArgSpec[];
  readonly description: string;
  readonly name: string;
  readonly run: (
    args: Record<string, unknown>
  ) => Effect.Effect<unknown, unknown, Engine>;
}

const arg = (
  name: string,
  kind: ArgKind,
  description: string,
  optional = false
): ArgSpec => ({ description, kind, name, optional });

/**
 * Dates only ever appear nested inside a structure, so scalars pass through
 * untouched — reviving a bare string would try to parse it as a JSON document,
 * which a base64 payload is not.
 */
const revived = (value: unknown): unknown =>
  typeof value === "object" && value !== null ? reviveJsonDates(value) : value;

/**
 * Decode a payload against a shared schema at the boundary (I6).
 *
 * Payloads arrive as JSON, where dates are ISO strings; these schemas carry
 * `Date` on both sides, so the strings are revived before decoding (the same
 * boundary concern the graph store's JSON column has).
 */
const tryDecode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], Error> =>
  Effect.try({
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
    try: () => Schema.decodeUnknownSync(schema)(value),
  });

/** Decode a payload that arrived as JSON over a front-end boundary. */
const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], Error> => tryDecode(schema, revived(value));

/**
 * Decode a value assembled in this process from already-decoded parts. It skips
 * revival, which round-trips through JSON and would destroy a `Uint8Array`.
 */
const decodeValue = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], Error> => tryDecode(schema, value);

const engine = <A, E>(
  fn: (e: Engine["Service"]) => Effect.Effect<A, E>
): Effect.Effect<A, E, Engine> =>
  Effect.gen(function* () {
    const e = yield* EngineTag;
    return yield* fn(e);
  });

const asNumber = (value: unknown): number | undefined =>
  value === undefined ? undefined : Number(value);

export const operations: readonly AgentOperation[] = [
  {
    args: [
      arg("kind", "string", "source | transform | type", true),
      arg("pack", "string", "pack slug", true),
      arg("archetype", "string", "transform archetype", true),
      arg(
        "runnable",
        "boolean",
        "narrow to sources this deployment can actually acquire",
        true
      ),
    ],
    description:
      "List what this deployment can do: registered sources, transforms, and ontology types.",
    name: "catalog_list",
    run: (args) =>
      Effect.gen(function* () {
        const filter = yield* decode(CatalogFilter, {
          ...(args.archetype === undefined
            ? {}
            : { archetype: args.archetype }),
          ...(args.kind === undefined ? {} : { kind: args.kind }),
          ...(args.pack === undefined ? {} : { pack: args.pack }),
          ...(args.runnable === undefined ? {} : { runnable: args.runnable }),
        });
        return yield* engine((e) => e.catalog(filter));
      }),
  },
  {
    args: [arg("id", "string", "catalog entry id")],
    description:
      "Describe one catalog entry, with its input/output contract as JSON Schema where one applies.",
    name: "catalog_describe",
    run: (args) => engine((e) => e.describe(String(args.id))),
  },
  {
    args: [
      arg("transformId", "string", "catalog id of the transform"),
      arg("input", "json", "input matching the transform's published schema"),
    ],
    description:
      "Run a transform by catalog id. Returns staged, evidence-attributed steps; committing them is a separate act.",
    name: "run_transform",
    run: (args) =>
      engine((e) =>
        e.runCatalogTransform(String(args.transformId), args.input)
      ),
  },
  {
    args: [
      arg("staged", "json", "staged steps to correlate"),
      arg("existing", "json", "the graph state to correlate against"),
      arg("rules", "json", "match rules"),
    ],
    description:
      "Correlate staged entities against existing graph state, yielding merge steps.",
    name: "correlate",
    run: (args) =>
      Effect.gen(function* () {
        const staged = yield* decode(Schema.Array(Step), args.staged);
        const existing = yield* decode(GraphState, args.existing);
        const rules = yield* decode(Schema.Array(MatchRule), args.rules);
        return yield* engine((e) => e.correlate(staged, existing, rules));
      }),
  },
  {
    args: [
      arg("content", "string", "the retrieved bytes, base64-encoded"),
      arg("contentType", "string", "media type of the retrieved bytes"),
      arg("by", "string", "who retrieved it"),
      arg("ref", "string", "where it came from (URL, case reference)", true),
    ],
    description:
      "Submit externally acquired bytes as evidence, recorded as manually retrieved. For sources the engine cannot fetch: a person or an agent retrieves the artifact and submits it here.",
    name: "ingest",
    run: (args) =>
      Effect.gen(function* () {
        // Binary cannot cross a JSON boundary as a Uint8Array — encoding one
        // yields an index-keyed object that will not decode back — so it
        // arrives base64 and is converted by the shared codec (I6).
        const bytes = yield* decode(
          Schema.Uint8ArrayFromBase64,
          String(args.content)
        );
        const acquiredAt = new Date();
        const input = yield* decodeValue(EvidenceInput, {
          acquiredAt,
          acquisitionPath: Manual.make({
            by: String(args.by),
            ...(args.ref === undefined ? {} : { ref: String(args.ref) }),
          }),
          bytes,
          contentType: String(args.contentType),
          observedAt: acquiredAt,
        });
        const stored = yield* engine((e) => e.ingest(input));
        // Echoing the bytes back is waste — the caller just sent them, and a
        // JSON-encoded Uint8Array is an index-keyed object besides. The id is
        // the content hash, which is what a caller needs to attribute a step.
        return {
          acquiredAt: stored.acquiredAt,
          acquisitionPath: stored.acquisitionPath,
          contentType: stored.contentType,
          id: stored.id,
          observedAt: stored.observedAt,
        };
      }),
  },
  {
    args: [
      arg("id", "string", "evidence identifier (the content hash)"),
      arg(
        "includeContent",
        "boolean",
        "return the artifact's bytes, base64-encoded",
        true
      ),
    ],
    description:
      "Read a stored artifact back: how it was acquired, when, and what type. Content is withheld unless asked for, because artifacts can be large and a trail usually wants the record.",
    name: "evidence_get",
    run: (args) =>
      Effect.gen(function* () {
        const found = yield* engine((e) =>
          e.evidence(evidenceId(String(args.id)))
        );
        if (Option.isNone(found)) {
          return null;
        }
        const record = found.value;
        const summary = {
          acquiredAt: record.acquiredAt,
          acquisitionPath: record.acquisitionPath,
          byteLength: record.bytes.byteLength,
          contentType: record.contentType,
          id: record.id,
          observedAt: record.observedAt,
        };
        if (args.includeContent !== true) {
          return summary;
        }
        // Same boundary fact as `ingest`: a JSON-encoded Uint8Array is an
        // index-keyed object that will not decode back, so bytes travel as
        // base64 through the shared codec.
        const content = yield* Effect.try({
          catch: (cause) =>
            cause instanceof Error ? cause : new Error(String(cause)),
          try: () =>
            Schema.encodeUnknownSync(Schema.Uint8ArrayFromBase64)(record.bytes),
        });
        return { ...summary, content };
      }),
  },
  {
    args: [arg("step", "json", "an evidence-attributed step")],
    description:
      "Commit one step to the graph. Rejected unless it is attributed to evidence.",
    name: "insert",
    run: (args) =>
      Effect.gen(function* () {
        const step = yield* decode(Step, args.step);
        return yield* engine((e) => e.insert(step));
      }),
  },
  {
    args: [],
    description: "Read the append-only step log.",
    name: "log",
    run: () => engine((e) => e.log),
  },
  {
    args: [arg("id", "string", "entity id")],
    description: "Query one entity by id from the folded graph.",
    name: "query_entity",
    run: (args) => engine((e) => e.queryEntity(String(args.id))),
  },
  {
    args: [],
    description: "Replay the step log into graph state.",
    name: "replay",
    run: () => engine((e) => e.replay),
  },
  {
    args: [
      arg("from", "string", "source entity id"),
      arg("to", "string", "target entity id"),
      arg("maxDepth", "number", "depth bound", true),
    ],
    description: "Shortest paths between two entities, depth-bounded.",
    name: "paths",
    run: (args) =>
      engine((e) =>
        e.paths(String(args.from), String(args.to), asNumber(args.maxDepth))
      ),
  },
  {
    args: [
      arg("from", "string", "window start (ISO 8601)"),
      arg("to", "string", "window end (ISO 8601)"),
    ],
    description: "Scan a temporal window for entities and events.",
    name: "timeline",
    run: (args) =>
      Effect.gen(function* () {
        const from = yield* decode(Schema.Date, args.from);
        const to = yield* decode(Schema.Date, args.to);
        return yield* engine((e) => e.timeline(from, to));
      }),
  },
  {
    args: [
      arg("minLat", "number", "bounding box min latitude"),
      arg("minLon", "number", "bounding box min longitude"),
      arg("maxLat", "number", "bounding box max latitude"),
      arg("maxLon", "number", "bounding box max longitude"),
    ],
    description: "Scan a spatial bounding box (WGS84).",
    name: "spatial",
    run: (args) =>
      engine((e) =>
        e.spatial({
          maxLat: Number(args.maxLat),
          maxLon: Number(args.maxLon),
          minLat: Number(args.minLat),
          minLon: Number(args.minLon),
        })
      ),
  },
  {
    args: [
      arg("surface", "string", "which surface's configuration this is"),
      arg("version", "number", "the version the surface understands"),
      arg("investigation", "string", "investigation id", true),
      arg("user", "string", "user id", true),
    ],
    description:
      "Load a surface's stored configuration. Absent covers never-saved, unreadable, and written-under-another-version alike — all mean start from defaults.",
    name: "view_state_load",
    run: (args) =>
      Effect.gen(function* () {
        const key = yield* decode(ViewStateKey, {
          investigation: args.investigation ?? defaultInvestigation,
          surface: String(args.surface),
          user: args.user ?? localUser,
        });
        return yield* engine((e) => e.loadViewState(key, Number(args.version)));
      }),
  },
  {
    args: [
      arg("surface", "string", "which surface's configuration this is"),
      arg("version", "number", "the version the surface understands"),
      arg("payload", "json", "the configuration to store"),
      arg("investigation", "string", "investigation id", true),
      arg("user", "string", "user id", true),
    ],
    description:
      "Persist a surface's configuration. Never enters the step log or evidence — view state is not part of the trail (I12).",
    name: "view_state_save",
    run: (args) =>
      Effect.gen(function* () {
        const document = yield* decode(ViewStateDocument, {
          key: {
            investigation: args.investigation ?? defaultInvestigation,
            surface: String(args.surface),
            user: args.user ?? localUser,
          },
          payload: args.payload ?? null,
          version: Number(args.version),
        });
        return yield* engine((e) => e.saveViewState(document));
      }),
  },
  {
    args: [
      arg("seed", "string", "seed entity id"),
      arg("maxDepth", "number", "depth bound", true),
    ],
    description: "Rank entities reachable from a seed by graph distance.",
    name: "relatedness",
    run: (args) =>
      engine((e) => e.relatedness(String(args.seed), asNumber(args.maxDepth))),
  },
];

/** Operation names, as both front-ends must expose them (parity, I8). */
export const operationNames: readonly string[] = operations.map(
  (operation) => operation.name
);

export const findOperation = (name: string): AgentOperation | undefined =>
  operations.find((operation) => operation.name === name);
