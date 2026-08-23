import { assert, describe, it } from "vitest";
import { makeClient, OperationFailure } from "../src/client.js";

const responding = (status: number, body: unknown) =>
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

const failing = () =>
  makeClient({
    fetch: () => Promise.reject(new Error("connection refused")),
    origin: "http://engine.test",
  });

describe("the client turns statuses into typed failures", () => {
  it("returns the body on success", async () => {
    const result = await responding(200, [{ id: "crt.sh" }]).call(
      "catalog_list"
    );
    assert.deepStrictEqual(result, [{ id: "crt.sh" }]);
  });

  it("400 is an invalid payload", async () => {
    try {
      await responding(400, { error: "Expected a valid Date" }).call("insert");
      assert.fail("expected a failure");
    } catch (cause) {
      assert.instanceOf(cause, OperationFailure);
      assert.strictEqual((cause as OperationFailure).kind, "invalid");
    }
  });

  it("404 is an unknown operation", async () => {
    try {
      await responding(404, { error: "no operation named 'nope'" }).call(
        "nope"
      );
      assert.fail("expected a failure");
    } catch (cause) {
      assert.strictEqual((cause as OperationFailure).kind, "unknown");
    }
  });

  it("422 is an operation failure, carrying the engine's tag", async () => {
    try {
      await responding(422, {
        error: "no catalog entry with id 'x'",
        tag: "UnknownCatalogEntry",
      }).call("catalog_describe", { id: "x" });
      assert.fail("expected a failure");
    } catch (cause) {
      const failure = cause as OperationFailure;
      assert.strictEqual(failure.kind, "failed");
      assert.strictEqual(failure.tag, "UnknownCatalogEntry");
    }
  });

  it("an unreachable engine is distinguishable from a rejected request", async () => {
    try {
      await failing().call("log");
      assert.fail("expected a failure");
    } catch (cause) {
      const failure = cause as OperationFailure;
      assert.strictEqual(failure.kind, "unreachable");
      assert.include(failure.message, "http://engine.test");
    }
  });

  it("reads the operation listing for discovery", async () => {
    const listed = await responding(200, [
      { args: [], description: "d", name: "log" },
    ]).operations();
    assert.strictEqual(listed[0]?.name, "log");
  });
});
