import type { Engine } from "@viokit/engine";
import { Engine as EngineTag } from "@viokit/engine";
import {
  CatalogFilter,
  EvidenceInput,
  GraphState,
  Manual,
  MatchRule,
  reviveJsonDates,
  Step,
} from "@viokit/schema";
import { Effect, Schema } from "effect";

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
        return yield* engine((e) => e.ingest(input));
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
