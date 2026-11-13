import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import { SourceSpec } from "../src/index.js";

const validExec = {
  args: ["+noall", "+answer", "{domain}", "A"],
  command: "dig",
  kind: "passive",
  maxOutputBytes: 65_536,
  params: [{ name: "domain", type: "domain" }],
  timeoutMs: 10_000,
};

const decode = (exec: unknown) =>
  Schema.decodeUnknownSync(SourceSpec)({
    exec,
    id: "dig",
    transport: "exec",
    url: "exec:dig",
  });

describe("exec source declaration", () => {
  it("accepts a valid exec block", () => {
    const spec = decode(validExec);
    assert.strictEqual(spec.transport, "exec");
    assert.strictEqual(spec.exec?.command, "dig");
    assert.strictEqual(spec.exec?.kind, "passive");
    assert.strictEqual(spec.exec?.params[0]?.type, "domain");
  });

  it("accepts an enum parameter with its values and a declared env", () => {
    const spec = decode({
      ...validExec,
      env: { LANG: "C" },
      params: [{ name: "type", type: "enum", values: ["A", "AAAA"] }],
    });
    assert.deepStrictEqual(spec.exec?.params[0]?.values, ["A", "AAAA"]);
    assert.deepStrictEqual(spec.exec?.env, { LANG: "C" });
  });

  it("rejects a block without a kind", () => {
    const { kind: _kind, ...withoutKind } = validExec;
    assert.throws(() => decode(withoutKind));
  });

  it("rejects an unknown kind", () => {
    assert.throws(() => decode({ ...validExec, kind: "noisy" }));
  });

  it("rejects an unknown parameter type", () => {
    assert.throws(() =>
      decode({ ...validExec, params: [{ name: "domain", type: "regex" }] })
    );
  });
});
