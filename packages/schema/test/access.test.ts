import { assert, describe, it } from "@effect/vitest";
import { AccessSignals, classifyAccess, isBareHost } from "../src/access.js";

const signals = (overrides: Partial<AccessSignals>) =>
  AccessSignals.make({
    browserAvailable: false,
    contentType: "application/octet-stream",
    machineReadable: false,
    url: "https://example.test/endpoint",
    ...overrides,
  });

describe("telling a site's front door from something within it", () => {
  it("recognises a bare host", () => {
    assert.isTrue(isBareHost("https://example.test"));
    assert.isTrue(isBareHost("https://example.test/"));
  });

  it("recognises a path, a query, and a fragment as not a front door", () => {
    assert.isFalse(isBareHost("https://example.test/api/v1"));
    assert.isFalse(isBareHost("https://example.test/?q=1"));
    assert.isFalse(isBareHost("https://example.test/#section"));
  });
});

describe("reading what a source served", () => {
  it("calls a parseable json endpoint an open api", () => {
    const verdict = classifyAccess(
      signals({ contentType: "application/json", machineReadable: true })
    );
    assert.strictEqual(verdict.access, "open_api");
  });

  it("respects a content type's parameters", () => {
    const verdict = classifyAccess(
      signals({
        contentType: "application/json; charset=utf-8",
        machineReadable: true,
      })
    );
    assert.strictEqual(verdict.access, "open_api");
  });

  it("accepts a vendor json suffix", () => {
    const verdict = classifyAccess(
      signals({
        contentType: "application/vnd.api+json",
        machineReadable: true,
      })
    );
    assert.strictEqual(verdict.access, "open_api");
  });

  it("refuses to call a json endpoint an api when the body does not parse", () => {
    const verdict = classifyAccess(
      signals({ contentType: "application/json", machineReadable: false })
    );
    assert.strictEqual(verdict.access, "unknown");
    assert.include(verdict.reason, "did not parse");
  });

  it("calls a csv download a dataset", () => {
    assert.strictEqual(
      classifyAccess(signals({ contentType: "text/csv" })).access,
      "dataset"
    );
  });

  it("calls an archive a dataset", () => {
    assert.strictEqual(
      classifyAccess(signals({ contentType: "application/zip" })).access,
      "dataset"
    );
  });

  it("calls a page a browser source", () => {
    assert.strictEqual(
      classifyAccess(signals({ contentType: "text/html" })).access,
      "browser_scrape"
    );
  });

  /**
   * The finding that reshaped this rule: a sweep of the catalog found 31 of 38
   * specs pointing at a bare host, so every source served HTML. Classifying
   * from a front door would have marked most of the catalog browser-only.
   */
  it("refuses to classify a site from its front door", () => {
    const verdict = classifyAccess(
      signals({ contentType: "text/html", url: "https://example.test" })
    );
    assert.strictEqual(verdict.access, "unknown");
    assert.include(verdict.reason, "front door");
  });

  it("still classifies a page that is not the front door", () => {
    const verdict = classifyAccess(
      signals({ contentType: "text/html", url: "https://example.test/search" })
    );
    assert.strictEqual(verdict.access, "browser_scrape");
  });

  /** A machine-readable response from a front door is still machine-readable. */
  it("does not refuse a non-page response from a front door", () => {
    const verdict = classifyAccess(
      signals({
        contentType: "application/json",
        machineReadable: true,
        url: "https://example.test",
      })
    );
    assert.strictEqual(verdict.access, "open_api");
  });

  /**
   * A credential wall is usually served as HTML, so representation must not be
   * tested before reachability — otherwise a key-gated API reads as a page.
   */
  it("calls a rejected request key-gated even when the rejection is a page", () => {
    const verdict = classifyAccess(
      signals({ contentType: "text/html", status: 401 })
    );
    assert.strictEqual(verdict.access, "requires_key");
  });

  /**
   * A 403 is what a credential wall answers and equally what a site answers to
   * a client it dislikes. A catalog sweep drew three, all from large sites that
   * block unidentified clients.
   */
  it("declines to read a forbidden response as a credential requirement", () => {
    const verdict = classifyAccess(
      signals({ contentType: "text/html", status: 403 })
    );
    assert.strictEqual(verdict.access, "unknown");
    assert.include(verdict.reason, "blocked client");
  });

  it("declines to classify from an error response", () => {
    const verdict = classifyAccess(
      signals({ contentType: "text/html", status: 500 })
    );
    assert.strictEqual(verdict.access, "unknown");
    assert.include(verdict.reason, "500");
  });

  it("declines to classify a response that declared no type", () => {
    const verdict = classifyAccess(signals({}));
    assert.strictEqual(verdict.access, "unknown");
    assert.include(verdict.reason, "no content type");
  });

  it("declines to classify an unrecognised type", () => {
    const verdict = classifyAccess(signals({ contentType: "audio/mpeg" }));
    assert.strictEqual(verdict.access, "unknown");
  });

  describe("whether a page needs a browser", () => {
    it("says so when its content only appears once rendered", () => {
      const verdict = classifyAccess(
        signals({ contentType: "text/html", jsDependent: true })
      );
      assert.include(verdict.reason, "once rendered");
    });

    it("says an http transport can reach it when it does not", () => {
      const verdict = classifyAccess(
        signals({ contentType: "text/html", jsDependent: false })
      );
      assert.include(verdict.reason, "http transport can reach it");
    });

    /** "We did not look" and "we looked and it does not" are different facts. */
    it("says it did not look when no browser was available", () => {
      const verdict = classifyAccess(signals({ contentType: "text/html" }));
      assert.include(verdict.reason, "no browser was available");
    });

    /** And so is "we looked and could not tell" — a third case, not the first. */
    it("does not claim it had no browser when rendering merely failed", () => {
      const verdict = classifyAccess(
        signals({ browserAvailable: true, contentType: "text/html" })
      );
      assert.notInclude(verdict.reason, "no browser was available");
      assert.include(verdict.reason, "did not succeed");
    });
  });
});
