import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import {
  defaultInvestigation,
  localUser,
  ViewStateDocument,
  ViewStateKey,
} from "@viokit/schema";
import { Effect, Option } from "effect";
import { makeViewStateStore } from "../src/view-state.js";

const root = () => mkdtempSync(join(tmpdir(), "viokit-view-state-"));

const key = (surface: string, investigation = defaultInvestigation) =>
  ViewStateKey.make({ investigation, surface, user: localUser });

const doc = (surface: string, payload: unknown, version = 1) =>
  ViewStateDocument.make({
    key: key(surface),
    payload: payload as never,
    version,
  });

const run = <A>(effect: Effect.Effect<A, never>) => Effect.runPromise(effect);

describe("view state round-trips", () => {
  it("loads back exactly what was saved", async () => {
    const store = makeViewStateStore(root());
    await Effect.runPromise(
      store.save(doc("console", { selected: "whois", view: "launcher" }))
    );
    const loaded = await run(store.load(key("console"), 1));
    assert.deepStrictEqual(Option.getOrNull(loaded)?.payload, {
      selected: "whois",
      view: "launcher",
    });
  });

  it("keeps keys isolated across surfaces, investigations, and users", async () => {
    const dir = root();
    const store = makeViewStateStore(dir);
    await Effect.runPromise(store.save(doc("console", { a: 1 })));

    assert.isTrue(Option.isNone(await run(store.load(key("graph"), 1))));
    assert.isTrue(
      Option.isNone(await run(store.load(key("console", "other-case"), 1)))
    );
    assert.isTrue(
      Option.isNone(
        await run(
          store.load(
            ViewStateKey.make({
              investigation: defaultInvestigation,
              surface: "console",
              user: "someone-else",
            }),
            1
          )
        )
      )
    );
  });

  it("reports absence for a key never written", async () => {
    const store = makeViewStateStore(root());
    assert.isTrue(Option.isNone(await run(store.load(key("nothing"), 1))));
  });
});

describe("unusable stored state degrades to defaults", () => {
  it("treats a document from another version as absent", async () => {
    const store = makeViewStateStore(root());
    await Effect.runPromise(store.save(doc("console", { a: 1 }, 1)));
    // The surface has moved on; the old document must not be misread.
    assert.isTrue(Option.isNone(await run(store.load(key("console"), 2))));
  });

  it("treats an undecodable document as absent rather than failing", async () => {
    const dir = root();
    const store = makeViewStateStore(dir);
    await Effect.runPromise(store.save(doc("console", { a: 1 })));

    // Corrupt every document in the root.
    const { readdirSync } = await import("node:fs");
    for (const file of readdirSync(dir)) {
      writeFileSync(join(dir, file), "{ not json at all", "utf8");
    }

    assert.isTrue(Option.isNone(await run(store.load(key("console"), 1))));
  });

  it("an unconfigured root saves nothing and loads absence", async () => {
    const store = makeViewStateStore("");
    const saved = await Effect.runPromise(
      Effect.result(store.save(doc("c", {})))
    );
    assert.strictEqual(saved._tag, "Failure");
    assert.isTrue(Option.isNone(await run(store.load(key("c"), 1))));
  });
});
