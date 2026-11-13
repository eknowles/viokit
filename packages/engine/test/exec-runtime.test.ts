import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it, layer } from "@effect/vitest";
import {
  PackManifest,
  SecretProviderService,
  SourceAuth,
  SourceError,
  SourceRuntimeService,
  SourceSpec,
  SourceTransportService,
  TransportCapabilities,
  type TransportKind,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { CacheLayer, requestFingerprint } from "../src/cache.js";
import { EgressLayer } from "../src/egress.js";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { RateLimiterLayer } from "../src/rate-limit.js";
import { makeEnvSecretProvider } from "../src/secrets.js";
import { SourceRuntimeLayer } from "../src/source-runtime.js";
import { makeViewStateLayer } from "../src/view-state.js";

const execSource = (
  overrides: Partial<ConstructorParameters<typeof SourceSpec>[0]> = {}
) =>
  SourceSpec.make({
    cache: { maxStaleMs: 0, mode: "cache-first", ttlMs: 60_000 },
    exec: {
      args: ["+short", "{domain}", "A"],
      command: "dig",
      kind: "active",
      maxOutputBytes: 1024,
      params: [{ name: "domain", type: "domain" }],
      timeoutMs: 1000,
    },
    id: "dig",
    transport: "exec",
    url: "exec:dig",
    ...overrides,
  });

/** The source as the runtime sees it after binding `domain`. */
const bind = (source: SourceSpec, domain: string): SourceSpec => {
  const { exec } = source;
  assert.isDefined(exec);
  return SourceSpec.make({
    ...source,
    exec: { ...exec, args: ["+short", domain, "A"] },
  });
};

describe("exec cache identity", () => {
  it("fingerprints two inputs to one command differently", () => {
    const base = execSource();
    assert.notStrictEqual(
      requestFingerprint(bind(base, "a.example")),
      requestFingerprint(bind(base, "b.example"))
    );
    assert.strictEqual(
      requestFingerprint(bind(base, "a.example")),
      requestFingerprint(bind(base, "a.example"))
    );
  });

  it("still strips credentials", () => {
    const base = bind(execSource(), "a.example");
    const authed = SourceSpec.make({
      ...base,
      auth: SourceAuth.make({ scheme: "bearer", secretRef: "K" }),
    });
    assert.strictEqual(requestFingerprint(authed), requestFingerprint(base));
  });

  it("leaves a non-exec fingerprint unchanged by the exec field", () => {
    const http = SourceSpec.make({ id: "h", transport: "http", url: "u" });
    assert.notStrictEqual(
      requestFingerprint(http),
      requestFingerprint(bind(execSource({ id: "h" }), "a.example"))
    );
  });
});

const runtimeWith = (
  calls: string[][],
  capabilities?: readonly TransportKind[]
) => {
  const transport = Layer.succeed(SourceTransportService, {
    fetch: (source) =>
      Effect.sync(() => {
        calls.push([...(source.exec?.args ?? [])]);
        return {
          bytes: new TextEncoder().encode(`out ${source.exec?.args.join(" ")}`),
          contentType: "text/plain",
        };
      }),
  });
  const base = SourceRuntimeLayer.pipe(
    Layer.provide(transport),
    Layer.provide(CacheLayer),
    Layer.provide(EgressLayer),
    Layer.provide(RateLimiterLayer),
    Layer.provide(
      Layer.succeed(SecretProviderService, makeEnvSecretProvider({}))
    )
  );
  return capabilities === undefined
    ? base
    : Layer.provide(base, Layer.succeed(TransportCapabilities, capabilities));
};

const acquire = (domain: string) =>
  Effect.gen(function* () {
    const runtime = yield* SourceRuntimeService;
    return yield* runtime.run(execSource(), { domain });
  });

describe("exec through the source runtime", () => {
  it("runs the command for the second input rather than serving the first's cache entry", async () => {
    const calls: string[][] = [];
    const deployment = runtimeWith(calls, ["http", "dataset", "exec"]);
    const [first, second, firstAgain] = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* acquire("a.example");
        const b = yield* acquire("b.example");
        const again = yield* acquire("a.example");
        return [a, b, again] as const;
      }).pipe(Effect.provide(deployment))
    );
    assert.strictEqual(
      new TextDecoder().decode(first.bytes),
      "out +short a.example A"
    );
    assert.strictEqual(
      new TextDecoder().decode(second.bytes),
      "out +short b.example A"
    );
    assert.strictEqual(firstAgain.acquisitionPath._tag, "cache");
    assert.strictEqual(calls.length, 2);
  });

  it("reports a deployment without exec as not runnable, starting nothing", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      Effect.result(acquire("a.example")).pipe(
        Effect.provide(runtimeWith(calls, ["http", "dataset"]))
      )
    );
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "SourceNotRunnable");
    assert.include(JSON.stringify(result), "'exec'");
    assert.deepStrictEqual(calls, []);
  });

  it("refuses a bad value before any transport call", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      Effect.result(acquire("-f/etc/passwd")).pipe(
        Effect.provide(runtimeWith(calls, ["http", "dataset", "exec"]))
      )
    );
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "'domain'");
    assert.deepStrictEqual(calls, []);
  });
});

const pack = PackManifest.make({
  pack: "tools",
  sources: [execSource()],
  transforms: [],
});

const catalogLayer = (capabilities: readonly TransportKind[]) =>
  Layer.provide(
    makeEngineLayer([pack]),
    Layer.mergeAll(
      Layer.succeed(SourceTransportService, {
        fetch: () => Effect.fail(SourceError.make({ message: "unused" })),
      }),
      EvidenceBackendMemory,
      OntologyRegistryLayer,
      makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-"))),
      Layer.succeed(TransportCapabilities, capabilities)
    )
  );

describe("catalog lists exec sources", () => {
  layer(catalogLayer(["http", "dataset", "exec"]))((scenario) => {
    scenario.effect("shows the kind and that the source is runnable", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const [entry] = yield* engine.catalog({ kind: "source" });
        assert.strictEqual(entry?.execKind, "active");
        assert.strictEqual(entry?.runnable, true);
      })
    );
  });

  layer(catalogLayer(["http", "dataset"]))((scenario) => {
    scenario.effect("reports the missing transport as the reason", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const [entry] = yield* engine.catalog({ kind: "source" });
        assert.strictEqual(entry?.runnable, false);
        assert.include(entry?.reason ?? "", "'exec'");
        assert.strictEqual(entry?.execKind, "active");
      })
    );
  });
});
