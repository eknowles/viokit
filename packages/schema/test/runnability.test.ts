import { assert, describe, it } from "@effect/vitest";
import {
  runnabilityOf,
  type SecretResolves,
  SourceAuth,
  SourceSpec,
  type TransportKind,
} from "../src/index.js";

const resolvesAll: SecretResolves = () => true;
const auth = SourceAuth.make({ scheme: "bearer", secretRef: "SHODAN_KEY" });

const spec = (
  access: SourceSpec["access"],
  extra: { auth?: SourceAuth; transport?: SourceSpec["transport"] } = {}
): SourceSpec =>
  SourceSpec.make({
    access,
    id: "s",
    transport: extra.transport ?? "http",
    url: "https://x.test",
    ...(extra.auth === undefined ? {} : { auth: extra.auth }),
  });

const withBrowser: readonly TransportKind[] = ["http", "dataset", "browser"];

describe("runnability derivation", () => {
  it("an open API over a provided transport is runnable", () => {
    assert.strictEqual(runnabilityOf(spec("open_api")).runnable, true);
  });

  it("a dataset source is runnable", () => {
    assert.strictEqual(
      runnabilityOf(spec("dataset", { transport: "dataset" })).runnable,
      true
    );
  });

  it("an unclassified source is attempted, not refused", () => {
    assert.strictEqual(runnabilityOf(spec("unknown")).runnable, true);
  });

  it("a browser-only source is not runnable without a browser transport", () => {
    const verdict = runnabilityOf(spec("browser_scrape"));
    assert.strictEqual(verdict.runnable, false);
    assert.include(verdict.reason ?? "", "browser");
  });

  it("a browser-only source is runnable where a browser is provided", () => {
    assert.strictEqual(
      runnabilityOf(spec("browser_scrape"), withBrowser).runnable,
      true
    );
  });

  it("a credential-gated source declaring no credential is not runnable", () => {
    const verdict = runnabilityOf(spec("requires_key"));
    assert.strictEqual(verdict.runnable, false);
    assert.include(verdict.reason ?? "", "credentials");
  });

  it("a declared credential that does not resolve is not runnable", () => {
    const verdict = runnabilityOf(
      spec("requires_key", { auth }),
      undefined,
      () => false
    );
    assert.strictEqual(verdict.runnable, false);
    assert.include(verdict.reason ?? "", "SHODAN_KEY");
    // The reason names the reference, never a value.
    assert.notInclude(verdict.reason ?? "", "secret");
  });

  it("a declared credential that resolves makes the source runnable", () => {
    const verdict = runnabilityOf(
      spec("requires_key", { auth }),
      undefined,
      resolvesAll
    );
    assert.strictEqual(verdict.runnable, true);
  });

  it("an open source declaring a credential still needs it to resolve", () => {
    assert.strictEqual(
      runnabilityOf(spec("open_api", { auth }), undefined, () => false)
        .runnable,
      false
    );
  });

  it("a source declaring a transport this deployment lacks is not runnable", () => {
    const verdict = runnabilityOf(
      spec("dataset", { transport: "dataset" }),
      ["http"],
      resolvesAll
    );
    assert.strictEqual(verdict.runnable, false);
    assert.include(verdict.reason ?? "", "dataset");
  });
});
