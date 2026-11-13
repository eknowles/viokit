import { assert, describe, it } from "@effect/vitest";
import { bindSource, SourceSpec, UnboundParameter } from "../src/index.js";

const source = SourceSpec.make({
  exec: {
    args: ["+short", "{domain}", "{type}"],
    command: "dig",
    kind: "passive",
    maxOutputBytes: 1024,
    params: [
      { name: "domain", type: "domain" },
      { name: "type", type: "enum", values: ["A", "AAAA"] },
    ],
    timeoutMs: 1000,
  },
  id: "dig",
  transport: "exec",
  url: "exec:dig",
});

const argsOf = (bound: SourceSpec | UnboundParameter) => {
  assert.isFalse(bound instanceof UnboundParameter);
  return (bound as SourceSpec).exec?.args;
};

const messageOf = (bound: SourceSpec | UnboundParameter): string => {
  assert.isTrue(bound instanceof UnboundParameter);
  return (bound as UnboundParameter).message;
};

describe("exec argument binding", () => {
  it("fills whole arguments", () => {
    assert.deepStrictEqual(
      argsOf(bindSource(source, { domain: "example.com", type: "A" })),
      ["+short", "example.com", "A"]
    );
  });

  it("refuses shell metacharacters as not a domain, never splitting them", () => {
    for (const value of [
      "a b; touch /tmp/PWNED $HOME 'q'.com",
      "example.com;ls",
      "$(id).example.com",
      "a.com`id`",
    ]) {
      const message = messageOf(
        bindSource(source, { domain: value, type: "A" })
      );
      assert.include(message, "'domain'");
      assert.include(message, "domain");
    }
  });

  it("embeds a token in one argument and refuses a semicolon", () => {
    const token = SourceSpec.make({
      exec: {
        args: ["--name={who}"],
        command: "tool",
        kind: "passive",
        maxOutputBytes: 1,
        params: [{ name: "who", type: "token" }],
        timeoutMs: 1,
      },
      id: "t",
      transport: "exec",
      url: "exec:tool",
    });
    assert.include(messageOf(bindSource(token, { who: "a;b" })), "'who'");
    assert.deepStrictEqual(argsOf(bindSource(token, { who: "a.b-c" })), [
      "--name=a.b-c",
    ]);
  });

  it("refuses values that look like options", () => {
    for (const value of ["-f/etc/passwd", "--version", "-x.example.com"]) {
      const message = messageOf(
        bindSource(source, { domain: value, type: "A" })
      );
      assert.include(message, "'domain'");
      assert.include(message, "'-'");
    }
  });

  it("refuses NUL and newline", () => {
    for (const value of ["a.com\n", "a.com\0x"]) {
      assert.include(
        messageOf(bindSource(source, { domain: value, type: "A" })),
        "'domain'"
      );
    }
  });

  it("refuses a wrong-typed value naming parameter and type", () => {
    const message = messageOf(
      bindSource(source, { domain: "not a domain", type: "A" })
    );
    assert.include(message, "'domain'");
    assert.include(message, "domain");
    assert.include(
      messageOf(bindSource(source, { domain: "a.com", type: "MX" })),
      "enum"
    );
  });

  it("refuses a missing value naming the parameter", () => {
    assert.include(
      messageOf(bindSource(source, { domain: "example.com" })),
      "missing parameter 'type'"
    );
  });

  it("ignores undeclared parameters", () => {
    const args = argsOf(
      bindSource(source, {
        domain: "example.com",
        extra: "--evil",
        type: "A",
      })
    );
    assert.deepStrictEqual(args, ["+short", "example.com", "A"]);
  });

  it("validates ip, cidr, url and integer", () => {
    const one = (type: "ip" | "cidr" | "url" | "integer", value: string) =>
      bindSource(
        SourceSpec.make({
          exec: {
            args: ["{v}"],
            command: "t",
            kind: "passive",
            maxOutputBytes: 1,
            params: [{ name: "v", type }],
            timeoutMs: 1,
          },
          id: "t",
          transport: "exec",
          url: "exec:t",
        }),
        { v: value }
      ) instanceof UnboundParameter;
    assert.isFalse(one("ip", "192.0.2.1"));
    assert.isFalse(one("ip", "2001:db8::1"));
    assert.isTrue(one("ip", "999.0.0.1"));
    assert.isTrue(one("ip", "1:2:3"));
    assert.isFalse(one("cidr", "10.0.0.0/8"));
    assert.isTrue(one("cidr", "10.0.0.0/33"));
    assert.isFalse(one("url", "https://example.com/a?b=c"));
    assert.isTrue(one("url", "file:///etc/passwd"));
    assert.isFalse(one("integer", "443"));
    assert.isTrue(one("integer", "4.5"));
  });
});
