import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer } from "@effect/vitest";
import {
  EgressOff,
  PackManifest,
  SourceSpec,
  SourceTransportService,
  TransportCapabilities,
} from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { makeViewStateLayer } from "../src/view-state.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const source = (
  id: string,
  overrides: Partial<Parameters<typeof SourceSpec.make>[0]> = {}
) =>
  SourceSpec.make({
    id,
    transport: "http",
    url: `https://${id}.test/endpoint`,
    ...overrides,
  });

const sources = [
  source("api", { access: "open_api" }),
  source("page-declared-api", { access: "open_api" }),
  source("walled", { access: "open_api" }),
  source("static-page", { access: "browser_scrape" }),
  source("rendered-page", { access: "browser_scrape" }),
  source("offline", { access: "open_api", egress: EgressOff.make({}) }),
  SourceSpec.make({
    access: "open_api",
    id: "front-door",
    transport: "http",
    url: "https://front-door.test",
  }),
];

const pack = PackManifest.make({ pack: "probe", sources, transforms: [] });

/**
 * Answers per source id, and differently for the browser transport — which is
 * the whole point of the js-dependence signal: the same url, served and
 * rendered, are two different things.
 */
const responses: Record<
  string,
  { readonly body: string; readonly contentType: string; status?: number }
> = {
  api: { body: '{"records":[]}', contentType: "application/json" },
  "front-door": {
    body: "<html><body><h1>Welcome</h1></body></html>",
    contentType: "text/html",
  },
  "page-declared-api": {
    body: "<html><body><h1>Search our records</h1></body></html>",
    contentType: "text/html",
  },
  "rendered-page": {
    body: "<html><body><div id='app'></div></body></html>",
    contentType: "text/html",
  },
  "static-page": {
    body: "<html><body><p>Everything you need is right here in the markup, plainly served.</p></body></html>",
    contentType: "text/html",
  },
  walled: {
    body: "<html><body>Please sign in to continue</body></html>",
    contentType: "text/html",
    status: 401,
  },
};

const rendered: Record<string, string> = {
  "rendered-page":
    "<html><body><div id='app'><p>Rows and rows of results that only exist once the script has run and filled the page.</p></div></body></html>",
  "static-page":
    "<html><body><p>Everything you need is right here in the markup, plainly served.</p></body></html>",
};

const transport = Layer.succeed(SourceTransportService, {
  fetch: (spec) => {
    const id = spec.id.replace("#rendered", "");
    if (spec.transport === "browser") {
      return Effect.succeed({
        bytes: text(rendered[id] ?? ""),
        contentType: "text/html",
      });
    }
    const response = responses[id];
    if (response === undefined) {
      return Effect.succeed({
        bytes: text(""),
        contentType: "application/octet-stream",
      });
    }
    return Effect.succeed({
      bytes: text(response.body),
      contentType: response.contentType,
      ...(response.status === undefined ? {} : { status: response.status }),
    });
  },
});

const base = Layer.mergeAll(
  transport,
  EvidenceBackendMemory,
  OntologyRegistryLayer,
  makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-probe-")))
);

const withBrowser = Layer.provide(
  makeEngineLayer([pack]),
  Layer.merge(
    base,
    Layer.succeed(TransportCapabilities, ["http", "dataset", "browser"])
  )
);

const withoutBrowser = Layer.provide(makeEngineLayer([pack]), base);

describe("verifying a source's access classification", () => {
  layer(withoutBrowser)((it) => {
    it.effect("confirms an endpoint that really does serve an api", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("api");
        assert.strictEqual(observation.observed, "open_api");
        assert.strictEqual(observation.declared, "open_api");
        assert.isTrue(observation.agrees);
      })
    );

    /** The failure the whole change exists for: 28 of 47 read `open_api`. */
    it.effect("reports a page that was classified as an api", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("page-declared-api");
        assert.strictEqual(observation.declared, "open_api");
        assert.strictEqual(observation.observed, "browser_scrape");
        assert.isFalse(observation.agrees);
      })
    );

    it.effect("leaves the source's own classification alone", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        yield* engine.verifyAccess("page-declared-api");
        const entry = yield* engine.describe("page-declared-api");
        assert.strictEqual(entry.entry.access, "open_api");
      })
    );

    it.effect("sees a credential wall behind a sign-in page", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("walled");
        assert.strictEqual(observation.observed, "requires_key");
        assert.strictEqual(observation.signals.status, 401);
      })
    );

    it.effect("names evidence that can be read back", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("api");
        const [id] = observation.evidence;
        assert.isDefined(id);
        const stored = yield* engine.evidence(id as never);
        assert.isTrue(Option.isSome(stored));
        if (Option.isSome(stored)) {
          assert.include(
            new TextDecoder().decode(stored.value.bytes),
            "records"
          );
        }
      })
    );

    /**
     * Runnability refuses on `access`, so a source declared browser-only would
     * be unprobeable in a deployment without a browser — the claim blocking its
     * own verification. Most `browser_scrape` sources declare an http
     * transport, so this is the common case.
     */
    it.effect(
      "checks a browser-only claim it could not otherwise acquire",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const observation = yield* engine.verifyAccess("static-page");
          assert.strictEqual(observation.declared, "browser_scrape");
          assert.strictEqual(observation.observed, "browser_scrape");
        })
    );

    it.effect("says it had no browser to look with", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("static-page");
        assert.isFalse(observation.signals.browserAvailable);
        assert.isUndefined(observation.signals.jsDependent);
      })
    );

    it.effect("fails as an unknown entry for a source nobody registered", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const result = yield* Effect.result(engine.verifyAccess("nonesuch"));
        assert.strictEqual(result._tag, "Failure");
      })
    );

    /** A probe is an acquisition, so acquisition policy applies to it (I4/I10). */
    it.effect("is refused by the source's own egress policy", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const result = yield* Effect.result(engine.verifyAccess("offline"));
        assert.strictEqual(result._tag, "Failure");
        if (result._tag === "Failure") {
          assert.strictEqual(result.failure._tag, "EgressDisabled");
        }
      })
    );
  });

  layer(withBrowser)((it) => {
    it.effect("finds a page whose content only appears once rendered", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("rendered-page");
        assert.isTrue(observation.signals.browserAvailable);
        assert.strictEqual(observation.signals.jsDependent, true);
        assert.include(observation.reason, "once rendered");
      })
    );

    it.effect("finds a page an http transport could have fetched", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("static-page");
        assert.strictEqual(observation.signals.jsDependent, false);
        assert.include(observation.reason, "http transport can reach it");
      })
    );

    it.effect("reports the ratio it judged on, not only its conclusion", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("rendered-page");
        assert.isDefined(observation.signals.renderedTextRatio);
      })
    );
  });
});

describe("a spec that points at a site's front door", () => {
  layer(withoutBrowser)((it) => {
    /**
     * The catalog reports this because it is the difference between a source
     * that is registered and one that is actually wired up: a sweep found 31 of
     * 38 specs pointing at a bare host, so nothing about them was verifiable.
     */
    it.effect("is reported as such by the catalog", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const entries = yield* engine.catalog({ kind: "source" } as never);
        const frontDoor = entries.find((entry) => entry.id === "front-door");
        const endpoint = entries.find((entry) => entry.id === "api");
        assert.strictEqual(frontDoor?.frontDoor, true);
        assert.strictEqual(endpoint?.frontDoor, false);
      })
    );

    /**
     * The demotion: every source promoted before the catalog required evidence
     * carries no `accessEvidence`, so its classification reads as the assertion
     * it is rather than as a checked fact.
     */
    it.effect("reports an unchecked classification as unverified", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const entries = yield* engine.catalog({ kind: "source" } as never);
        assert.isTrue(entries.every((entry) => entry.accessVerified === false));
      })
    );

    it.effect("is not classified from what its homepage serves", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const observation = yield* engine.verifyAccess("front-door");
        assert.strictEqual(observation.observed, "unknown");
        assert.include(observation.reason, "front door");
      })
    );
  });
});
