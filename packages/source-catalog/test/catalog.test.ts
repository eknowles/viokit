import { describe, expect, it } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { SourceCatalogLayer, SourceCatalogService } from "../src/catalog.js";
import { PromoterService } from "../src/seams.js";
import { SourceCatalogSqliteLayer } from "../src/sqlite.js";

const writes: Array<{
  category: string;
  sourceId: string;
  source: unknown;
}> = [];

const fakePromoterLayer = Layer.succeed(PromoterService, {
  writeSource: (category, sourceId, source) =>
    Effect.sync(() => {
      writes.push({ category, source, sourceId });
    }),
});

const testLayer = SourceCatalogLayer.pipe(
  Layer.provide(fakePromoterLayer),
  Layer.provide(SourceCatalogSqliteLayer)
);

/** Runs an effect with a fresh in-memory store per invocation (isolation). */
const run = <A, E>(effect: Effect.Effect<A, E, SourceCatalogService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(testLayer)));

describe("SourceCatalog work queue", () => {
  it("two agents never claim the same unit (R1)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        yield* svc.seed();
        const claimed: string[] = [];
        for (const _ of Array.from({ length: 5 })) {
          const a = yield* svc.claimWork("agent-a");
          const b = yield* svc.claimWork("agent-b");
          if (Option.isSome(a)) {
            claimed.push(a.value.id);
          }
          if (Option.isSome(b)) {
            claimed.push(b.value.id);
          }
        }
        expect(new Set(claimed).size).toBe(claimed.length);
        expect(claimed.length).toBeGreaterThan(0);
      })
    );
  });

  it("a claimed unit is not handed to a second agent (R1)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        yield* svc.seed();
        const first = yield* svc.claimWork("agent-a");
        expect(Option.isSome(first)).toBe(true);
        const second = yield* svc.claimWork("agent-b");
        if (Option.isSome(first) && Option.isSome(second)) {
          expect(second.value.id).not.toBe(first.value.id);
        }
      })
    );
  });
});

/**
 * A classification somebody checked. Promotion requires one: the catalog was
 * the one place an unattributed assertion could enter this system, and 37 of
 * them reached shipped pack files before this gate existed.
 */
const verifiedAs = (sourceId: string, observed = "open_api") => ({
  agrees: true,
  declared: observed,
  evidence: ["a".repeat(64)],
  observed,
  reason: "the endpoint served application/json that parsed",
  signals: {
    browserAvailable: false,
    contentType: "application/json",
    machineReadable: true,
    status: 200,
    url: "https://www.shodan.io/api/v1",
  },
  sourceId,
});

describe("SourceCatalog candidate store", () => {
  it("dedupes by (domain, url) and unions archetypes (R2/R3)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const first = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        const merged = yield* svc.submitCandidate({
          archetypes: ["search", "extract"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        expect(merged.id).toBe(first.id);
        expect([...merged.archetypes].sort()).toEqual([
          "extract",
          "lookup",
          "search",
        ]);
      })
    );
  });

  it("enrich adds classification fields (R2)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        const enriched = yield* svc.enrichCandidate(c.id, {
          access: "open_api",
          description: "network device index",
          note: "verified",
          transport: "http",
        });
        expect(enriched.access).toBe("open_api");
        expect(enriched.transport).toBe("http");
        expect(enriched.description).toContain("device");
      })
    );
  });

  it("list filters by category (R2)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        yield* svc.submitCandidate({
          archetypes: ["search"],
          category: "corporate-finance",
          domain: "opencorporates",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://opencorporates.com/",
        });
        const dns = yield* svc.listCandidates({ category: "web-dns" });
        expect(dns).toHaveLength(1);
        expect(dns[0]?.domain).toBe("shodan");
      })
    );
  });

  it("supersede keeps immutable history, marks old rejected (R3)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const old = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://old.example/",
        });
        const replacement = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://new.example/",
        });
        expect(old.id).not.toBe(replacement.id);
        const superseded = yield* svc.supersede(old.id, replacement.id);
        expect(superseded.status).toBe("rejected");
      })
    );
  });
});

describe("SourceCatalog promotion", () => {
  it("promotes once and writes a SourceSpec (R4)", async () => {
    await run(
      Effect.gen(function* () {
        writes.length = 0;
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        const promoted = yield* svc.promoteSource(
          c.id,
          { kind: "SourceSpec", transport: "dataset" },
          verifiedAs("shodan")
        );
        expect(promoted.status).toBe("promoted");
        expect(writes).toHaveLength(1);
        expect(writes[0]?.category).toBe("web-dns");
        expect(writes[0]?.sourceId).toBe("shodan");
      })
    );
  });

  it("refuses a promotion nobody verified", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        const outcome = yield* svc
          .promoteSource(c.id, { kind: "SourceSpec" }, {})
          .pipe(
            Effect.match({ onFailure: () => "failed", onSuccess: () => "ok" })
          );
        expect(outcome).toBe("failed");
      })
    );
  });

  /** A probe that concluded nothing is not a verification. */
  it("refuses a promotion whose probe concluded nothing", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        const outcome = yield* svc
          .promoteSource(
            c.id,
            { kind: "SourceSpec" },
            verifiedAs("shodan", "unknown")
          )
          .pipe(
            Effect.match({ onFailure: () => "failed", onSuccess: () => "ok" })
          );
        expect(outcome).toBe("failed");
      })
    );
  });

  it("refuses a verification of some other source", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        const outcome = yield* svc
          .promoteSource(
            c.id,
            { kind: "SourceSpec" },
            verifiedAs("somewhere-else")
          )
          .pipe(
            Effect.match({ onFailure: () => "failed", onSuccess: () => "ok" })
          );
        expect(outcome).toBe("failed");
      })
    );
  });

  it("writes the evidence its classification came from into the spec", async () => {
    await run(
      Effect.gen(function* () {
        writes.length = 0;
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        yield* svc.promoteSource(
          c.id,
          { kind: "SourceSpec" },
          verifiedAs("shodan")
        );
        const written = writes[0]?.source as {
          access: string;
          accessEvidence: string[];
        };
        expect(written.access).toBe("open_api");
        expect(written.accessEvidence).toHaveLength(1);
      })
    );
  });

  it("refuses a candidate that cannot be traced back", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const outcome = yield* svc
          .submitCandidate({
            archetypes: ["lookup"],
            category: "web-dns",
            domain: "shodan",
            url: "https://www.shodan.io/",
          })
          .pipe(
            Effect.match({ onFailure: () => "failed", onSuccess: () => "ok" })
          );
        expect(outcome).toBe("failed");
      })
    );
  });

  it("double promotion is rejected (R4)", async () => {
    await run(
      Effect.gen(function* () {
        const svc = yield* SourceCatalogService;
        const c = yield* svc.submitCandidate({
          archetypes: ["lookup"],
          category: "web-dns",
          domain: "shodan",
          origin: "https://awesome-osint.test/list#shodan",
          url: "https://www.shodan.io/",
        });
        yield* svc.promoteSource(
          c.id,
          { kind: "SourceSpec" },
          verifiedAs("shodan")
        );
        const outcome = yield* svc
          .promoteSource(c.id, { kind: "SourceSpec" }, verifiedAs("shodan"))
          .pipe(
            Effect.match({
              onFailure: () => "failed",
              onSuccess: () => "ok",
            })
          );
        expect(outcome).toBe("failed");
      })
    );
  });
});
