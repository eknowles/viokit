import { describe, expect, it } from "@effect/vitest";
import { Engine } from "@viokit/engine";
import {
  AddEntity,
  Entity,
  entityId,
  PackManifest,
  RegisteredTransform,
  SourceSpec,
  TemporalExtent,
  TransformSpec,
} from "@viokit/schema";
import { Effect, Schema } from "effect";
import { makeAgentProgramLayer } from "../src/program.js";

/**
 * The deployment as shipped: dispatch, the capability list and the runner are
 * wired together, so an exec source is listed as runnable and then really runs.
 */

const echo = SourceSpec.make({
  exec: {
    args: ["hello {word}"],
    command: "echo",
    kind: "active",
    maxOutputBytes: 1024,
    params: [{ name: "word", type: "token" }],
    timeoutMs: 5000,
  },
  id: "echo-tool",
  transport: "exec",
  url: "exec:echo",
});

const pack = PackManifest.make({
  pack: "exec-test",
  sources: [echo],
  transforms: [
    RegisteredTransform.make({
      project: (evidence: { bytes: Uint8Array }) => [
        AddEntity.make({
          entity: Entity.make({
            id: entityId(new TextDecoder().decode(evidence.bytes).trim()),
            identifiers: [],
            kind: "word",
            spatialExtent: { lat: 0, lon: 0 },
            temporalExtent: TemporalExtent.make({
              validFrom: new Date(0),
              validTo: new Date("9999-12-31T00:00:00.000Z"),
            }),
          }),
        }),
      ],
      source: echo,
      spec: TransformSpec.make({
        archetype: "lookup",
        id: "echo-word",
        input: Schema.Struct({ word: Schema.String }),
        output: Schema.Any,
        projection: "steps",
        sourceId: echo.id,
      }),
    }),
  ],
});

describe("the agent deployment declares exec", () => {
  it("lists an exec source as runnable with its kind, and runs it", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const [entry] = yield* engine.catalog({ kind: "source" });
        const steps = yield* engine.runCatalogTransform("echo-word", {
          word: "world",
        });
        return { entry, steps };
      }).pipe(Effect.provide(makeAgentProgramLayer([pack])))
    );
    expect(result.entry?.runnable).toBe(true);
    expect(result.entry?.execKind).toBe("active");
    expect(JSON.stringify(result.steps)).toContain("hello world");
  });
});
