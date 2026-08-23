import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { PromoterLayer } from "../src/promoter.js";
import type { Promoter, PromotionError } from "../src/seams.js";
import { PackRoot, PromoterService } from "../src/seams.js";

/**
 * The real write path, which had no test at all: it resolved its directory from
 * `process.cwd()`, so there was nothing to point at a temporary tree. With the
 * `PackRoot` seam there is.
 */
const withPackRoot = <A>(
  packRoot: string,
  use: (promoter: Promoter) => Effect.Effect<A, PromotionError>
) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const promoter = yield* PromoterService;
        return yield* use(promoter);
      }),
      Layer.provide(PromoterLayer, Layer.succeed(PackRoot, packRoot))
    )
  );

const spec = (id: string) => ({
  access: "open_api",
  id,
  transport: "http",
  url: `https://${id}/api`,
});

const root = () => mkdtempSync(join(tmpdir(), "viokit-packs-"));

const written = (dir: string, category: string) =>
  readFileSync(join(dir, category, "sources.ts"), "utf8");

describe("promoting a source into the pack tree", () => {
  test("writes the spec where the deployment reads it", async () => {
    const dir = root();
    await withPackRoot(dir, (promoter) =>
      promoter.writeSource("web-dns", "example.test", spec("example.test"))
    );
    const contents = written(dir, "web-dns");
    expect(contents).toContain("export const example_test: SourceSpec");
    expect(contents).toContain("https://example.test/api");
  });

  test("keeps the first source when a second is promoted", async () => {
    const dir = root();
    await withPackRoot(dir, (promoter) =>
      Effect.gen(function* () {
        yield* promoter.writeSource("web-dns", "one.test", spec("one.test"));
        yield* promoter.writeSource("web-dns", "two.test", spec("two.test"));
      })
    );
    const contents = written(dir, "web-dns");
    expect(contents).toContain("one_test");
    expect(contents).toContain("two_test");
    // The import header belongs at the top once, not once per promotion.
    expect(contents.split("import type { SourceSpec }").length - 1).toBe(1);
  });

  test("sanitises an id that is not a valid identifier", async () => {
    const dir = root();
    await withPackRoot(dir, (promoter) =>
      promoter.writeSource("web-dns", "1st.example", spec("1st.example"))
    );
    expect(written(dir, "web-dns")).toContain("export const _1st_example");
  });

  /**
   * Pack files are not type-checked by any tsconfig until a manifest imports
   * them, so the decode is the only thing standing between a candidate-shaped
   * object and a file annotated `SourceSpec`.
   */
  test("refuses a spec that does not decode, writing nothing", async () => {
    const dir = root();
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const promoter = yield* PromoterService;
          return yield* Effect.result(
            promoter.writeSource("web-dns", "bad.test", {
              domain: "bad.test",
              notASpec: true,
            })
          );
        }),
        Layer.provide(PromoterLayer, Layer.succeed(PackRoot, dir))
      )
    );
    expect(result._tag).toBe("Failure");
    expect(() => written(dir, "web-dns")).toThrow();
  });
});
