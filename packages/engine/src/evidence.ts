import { Evidence, type EvidenceStore, evidenceId } from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";
import { fnv1aHex } from "./hash.js";

/**
 * In-memory, write-once evidence store. Content hash is identity (I1): the id
 * is derived from the raw bytes at write time, identical bytes dedupe to the
 * same id, and stored artifacts are never mutated.
 */
export class EvidenceService extends Context.Service<
  EvidenceService,
  EvidenceStore
>()("EvidenceService", {
  make: Effect.sync(() => {
    const byId = new Map<string, Evidence>();

    const store: EvidenceStore = {
      get: (id) =>
        Effect.sync(() => {
          const value = byId.get(id);
          return value === undefined ? Option.none() : Option.some(value);
        }),
      list: Effect.sync(() => Array.from(byId.values())),
      put: (input) =>
        Effect.sync(() => {
          const id = evidenceId(fnv1aHex(input.bytes));
          const existing = byId.get(id);
          if (existing !== undefined) {
            return existing;
          }
          const evidence = Evidence.make({ id, ...input });
          byId.set(id, evidence);
          return evidence;
        }),
    };

    return store;
  }),
}) {}

export const EvidenceLayer = Layer.effect(
  EvidenceService,
  EvidenceService.make
);
