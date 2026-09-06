import { readdirSync, readFileSync } from "node:fs";

const TS_FILE = /\.tsx?$/;
const BROWSER_STORAGE = /\b(localStorage|sessionStorage|indexedDB)\b/;

import { assert, describe, it } from "vitest";
import { makeClient } from "../src/client.js";
import {
  defaultViewState,
  loadViewState,
  VERSION,
} from "../src/persistence.js";

const clientReturning = (body: unknown, status = 200) =>
  makeClient({
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status,
        })
      ),
    origin: "http://engine.test",
  });

describe("restoring the console's view state", () => {
  it("restores a valid stored payload", async () => {
    const state = await loadViewState(
      clientReturning({
        value: {
          key: { investigation: "default", surface: "console", user: "local" },
          payload: {
            camera: null,
            caseSelection: null,
            curation: { "acme.test": "kept" },
            graphSelection: { id: "acme.test", kind: "entity" },
            graphTime: null,
            runnableOnly: true,
            selectedTransform: "whois",
            view: "launcher",
          },
          version: VERSION,
        },
      })
    );
    assert.deepStrictEqual(state, {
      camera: null,
      caseSelection: null,
      curation: { "acme.test": "kept" },
      graphSelection: { id: "acme.test", kind: "entity" },
      graphTime: null,
      runnableOnly: true,
      selectedTransform: "whois",
      view: "launcher",
    });
  });

  it("falls back to defaults for a payload missing a field this version adds", async () => {
    // A document written by an older console that claims the current version:
    // half-applying it would leave the case canvas addressing a node that
    // payload never described.
    const state = await loadViewState(
      clientReturning({
        value: {
          key: { investigation: "default", surface: "console", user: "local" },
          payload: {
            curation: {},
            graphSelection: null,
            graphTime: null,
            runnableOnly: true,
            selectedTransform: "whois",
            view: "launcher",
          },
          version: VERSION,
        },
      })
    );
    assert.deepStrictEqual(state, defaultViewState);
  });

  it("falls back to defaults when nothing is stored", async () => {
    const state = await loadViewState(clientReturning({ _tag: "None" }));
    assert.deepStrictEqual(state, defaultViewState);
  });

  it("falls back to defaults for a payload of the wrong shape", async () => {
    const state = await loadViewState(
      clientReturning({ value: { payload: { view: 42 } } })
    );
    assert.deepStrictEqual(state, defaultViewState);
  });

  it("falls back to defaults when the engine is unreachable", async () => {
    const client = makeClient({
      fetch: () => Promise.reject(new Error("refused")),
      origin: "http://engine.test",
    });
    assert.deepStrictEqual(await loadViewState(client), defaultViewState);
  });

  it("falls back to defaults when the operation fails", async () => {
    const state = await loadViewState(
      clientReturning({ error: "boom", tag: "ViewStateWriteError" }, 422)
    );
    assert.deepStrictEqual(state, defaultViewState);
  });
});

describe("the graph camera as view state", () => {
  const stored = (camera: unknown) =>
    clientReturning({
      value: {
        payload: {
          camera,
          caseSelection: null,
          curation: {},
          graphSelection: null,
          graphTime: null,
          runnableOnly: false,
          selectedTransform: null,
          view: "case",
        },
        version: VERSION,
      },
    });

  it("restores where the investigator was looking", async () => {
    const state = await loadViewState(stored({ x: -120.5, y: 44, zoom: 1.8 }));
    assert.deepStrictEqual(state.camera, { x: -120.5, y: 44, zoom: 1.8 });
  });

  it("treats a case never framed as absent, not as the origin", async () => {
    const state = await loadViewState(stored(null));
    assert.isNull(state.camera);
  });

  it("rejects a half-written camera rather than framing somewhere meaningless", async () => {
    const broken = [
      { x: 1, y: 2 },
      { x: 1, y: 2, zoom: 0 },
      { x: 1, y: 2, zoom: -1 },
      { x: Number.NaN, y: 2, zoom: 1 },
      { x: 1, y: 2, zoom: "1.5" },
      "somewhere",
    ];
    const loaded = await Promise.all(
      broken.map((one) => loadViewState(stored(one)))
    );
    loaded.forEach((state, index) => {
      assert.deepStrictEqual(
        state,
        defaultViewState,
        `${JSON.stringify(broken[index])} should not have been applied`
      );
    });
  });

  it("survives a document written before the camera existed", async () => {
    // Older payloads have no `camera` key at all. Half-applying one would
    // leave the graph framed by a camera that document never described.
    const state = await loadViewState(
      clientReturning({
        value: {
          payload: {
            caseSelection: null,
            curation: {},
            graphSelection: null,
            graphTime: null,
            runnableOnly: false,
            selectedTransform: null,
            view: "case",
          },
          version: VERSION,
        },
      })
    );
    assert.deepStrictEqual(state, defaultViewState);
  });

  it("is never written to browser-local storage (I12)", () => {
    // Asserted against the source, not against a description of it: I12 says
    // view state is server-backed, and the way that gets broken is someone
    // reaching for localStorage because it is closer to hand.
    const root = new URL("../src/", import.meta.url);
    const offenders: string[] = [];
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(
          entry.name + (entry.isDirectory() ? "/" : ""),
          dir
        );
        if (entry.isDirectory()) {
          walk(child);
        } else if (TS_FILE.test(entry.name)) {
          const text = readFileSync(child, "utf8");
          if (BROWSER_STORAGE.test(text)) {
            offenders.push(entry.name);
          }
        }
      }
    };
    walk(root);
    assert.deepStrictEqual(offenders, [], "view state must be server-backed");
  });
});
