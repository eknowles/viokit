import { assert, describe, it } from "@effect/vitest";
import {
  type ResolvedCredential,
  SecretProviderService,
  SourceAuth,
  SourceRuntimeService,
  SourceSpec,
  SourceTransportService,
} from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { CacheLayer, requestFingerprint } from "../src/cache.js";
import { EgressLayer } from "../src/egress.js";
import { RateLimiterLayer } from "../src/rate-limit.js";
import {
  makeEnvSecretProvider,
  makeFileSecretProvider,
} from "../src/secrets.js";
import { SourceRuntimeLayer } from "../src/source-runtime.js";

const SECRET = "s3cr3t-value";

const auth = SourceAuth.make({
  name: "x-api-key",
  scheme: "header",
  secretRef: "TEST_KEY",
});

const gated = SourceSpec.make({
  access: "requires_key",
  auth,
  id: "gated",
  transport: "http",
  url: "https://gated.test/data",
});

/** Records what the transport was handed, so containment is assertable. */
const recordingTransport = (seen: (ResolvedCredential | undefined)[]) =>
  Layer.succeed(SourceTransportService, {
    fetch: (_source, credential) =>
      Effect.sync(() => {
        seen.push(credential);
        return {
          bytes: new TextEncoder().encode("payload"),
          contentType: "text/plain",
        };
      }),
  });

const runtime = (
  seen: (ResolvedCredential | undefined)[],
  secrets: Record<string, string | undefined>
) =>
  SourceRuntimeLayer.pipe(
    Layer.provide(recordingTransport(seen)),
    Layer.provide(CacheLayer),
    Layer.provide(EgressLayer),
    Layer.provide(RateLimiterLayer),
    Layer.provide(
      Layer.succeed(SecretProviderService, makeEnvSecretProvider(secrets))
    )
  );

const acquire = (spec: SourceSpec) =>
  Effect.gen(function* () {
    const rt = yield* SourceRuntimeService;
    return yield* rt.run(spec);
  });

describe("secret resolution", () => {
  it("treats an exported-but-empty value as absent", async () => {
    const provider = makeEnvSecretProvider({ BLANK: "   ", SET: "v" });
    const blank = await Effect.runPromise(provider.get("BLANK"));
    const set = await Effect.runPromise(provider.get("SET"));
    const missing = await Effect.runPromise(provider.get("NOPE"));
    assert.isTrue(Option.isNone(blank));
    assert.isTrue(Option.isNone(missing));
    assert.strictEqual(Option.getOrNull(set), "v");
  });

  it("a missing secrets file resolves nothing rather than failing", async () => {
    const provider = await Effect.runPromise(
      makeFileSecretProvider("/nonexistent/viokit-secrets.json")
    );
    assert.isTrue(Option.isNone(await Effect.runPromise(provider.get("ANY"))));
  });
});

describe("credentials reach the transport and nothing else", () => {
  it("hands the resolved credential to the transport, as declared", async () => {
    const seen: (ResolvedCredential | undefined)[] = [];
    await Effect.runPromise(
      acquire(gated).pipe(Effect.provide(runtime(seen, { TEST_KEY: SECRET })))
    );
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0]?.value, SECRET);
    assert.strictEqual(seen[0]?.scheme, "header");
    assert.strictEqual(seen[0]?.name, "x-api-key");
  });

  it("refuses before the transport when the reference does not resolve", async () => {
    const seen: (ResolvedCredential | undefined)[] = [];
    const result = await Effect.runPromise(
      Effect.result(acquire(gated).pipe(Effect.provide(runtime(seen, {}))))
    );
    assert.strictEqual(result._tag, "Failure");
    assert.deepStrictEqual(seen, []);
  });

  it("a resolution failure names the reference and carries no value", async () => {
    const seen: (ResolvedCredential | undefined)[] = [];
    const result = await Effect.runPromise(
      Effect.result(
        acquire(gated).pipe(Effect.provide(runtime(seen, { OTHER: SECRET })))
      )
    );
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      const { message } = result.failure as { message: string };
      assert.include(message, "TEST_KEY");
      assert.notInclude(message, SECRET);
    }
  });

  it("the credential never reaches the evidence record", async () => {
    const seen: (ResolvedCredential | undefined)[] = [];
    const evidence = await Effect.runPromise(
      acquire(gated).pipe(Effect.provide(runtime(seen, { TEST_KEY: SECRET })))
    );
    assert.notInclude(JSON.stringify(evidence), SECRET);
  });

  it("the cache fingerprint is unchanged by the credential", () => {
    const plain = SourceSpec.make({
      access: "requires_key",
      id: "gated",
      transport: "http",
      url: "https://gated.test/data",
    });
    assert.strictEqual(requestFingerprint(gated), requestFingerprint(plain));
  });
});
