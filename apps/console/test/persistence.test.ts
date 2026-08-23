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
            runnableOnly: true,
            selectedTransform: "whois",
            view: "launcher",
          },
          version: VERSION,
        },
      })
    );
    assert.deepStrictEqual(state, {
      runnableOnly: true,
      selectedTransform: "whois",
      view: "launcher",
    });
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
