import { assert, describe, layer } from "@effect/vitest";
import { EgressDirect, EgressOff, EgressProxy } from "@viokit/schema";
import { Effect, Result } from "effect";
import { EgressLayer, EgressService } from "../src/egress.js";

describe("egress resolution (task 3.1/3.2/3.3)", () => {
  layer(EgressLayer)((it) => {
    it.effect("direct maps to a live acquisition path", () =>
      Effect.gen(function* () {
        const egress = yield* EgressService;
        const decision = yield* egress.resolve(EgressDirect.make({}));
        assert.strictEqual(decision.path, "live");
      })
    );

    it.effect("proxy records the proxy id", () =>
      Effect.gen(function* () {
        const egress = yield* EgressService;
        const decision = yield* egress.resolve(
          EgressProxy.make({ proxyId: "proxy-1" })
        );
        assert.strictEqual(decision.path, "proxy");
        assert.strictEqual(decision.viaProxy, "proxy-1");
      })
    );

    it.effect("disabled fails with a typed egress error", () =>
      Effect.gen(function* () {
        const egress = yield* EgressService;
        const result = yield* egress
          .resolve(EgressOff.make({}))
          .pipe(Effect.result);
        assert.isTrue(Result.isFailure(result));
      })
    );
  });
});
