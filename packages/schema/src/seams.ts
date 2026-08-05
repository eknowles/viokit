import type { Effect, Option } from "effect";
import { Context } from "effect";
import type {
  EgressDisabledError,
  Entity,
  Evidence,
  EvidenceId,
  EvidenceInput,
  EvidenceReadError,
  EvidenceWriteError,
  GraphState,
  OfflineCacheMiss,
  ProvenanceError,
  RateLimited,
  RetryExhausted,
  SourceError,
  SourceSpec,
  Step,
} from "./schemas.js";

export interface EvidenceStore {
  readonly get: (
    id: EvidenceId
  ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
  readonly list: Effect.Effect<readonly Evidence[], EvidenceReadError>;
  readonly put: (
    input: EvidenceInput
  ) => Effect.Effect<Evidence, EvidenceWriteError>;
}

export interface GraphStore {
  readonly insert: (step: Step) => Effect.Effect<Step, ProvenanceError>;
  readonly log: Effect.Effect<readonly Step[]>;
  readonly queryEntity: (id: string) => Effect.Effect<Option.Option<Entity>>;
  readonly replay: Effect.Effect<GraphState>;
}

export interface SourceRuntime {
  readonly run: (
    source: SourceSpec
  ) => Effect.Effect<
    EvidenceInput,
    | SourceError
    | EgressDisabledError
    | OfflineCacheMiss
    | RateLimited
    | RetryExhausted
  >;
}

export class SourceRuntimeService extends Context.Service<
  SourceRuntimeService,
  SourceRuntime
>()("SourceRuntimeService") {}

/** Raw bytes a transport produced for a source, before projection. */
export interface TransportResult {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** A transport seam: turns a source into raw response bytes (task 4.5/5.1). */
export interface SourceTransport {
  readonly fetch: (
    source: SourceSpec
  ) => Effect.Effect<TransportResult, SourceError>;
}

export class SourceTransportService extends Context.Service<
  SourceTransportService,
  SourceTransport
>()("SourceTransportService") {}
