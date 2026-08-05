import type { Effect, Option } from "effect";
import { Context } from "effect";
import type {
  Entity,
  Evidence,
  EvidenceId,
  EvidenceInput,
  EvidenceReadError,
  EvidenceWriteError,
  GraphState,
  ProvenanceError,
  SourceError,
  SourceSpec,
  Step,
} from "./schemas.js";

export interface EvidenceStore {
  readonly get: (
    id: EvidenceId
  ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
  readonly list: Effect.Effect<readonly Evidence[]>;
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
  ) => Effect.Effect<EvidenceInput, SourceError>;
}

export class SourceRuntimeService extends Context.Service<
  SourceRuntimeService,
  SourceRuntime
>()("SourceRuntimeService") {}
