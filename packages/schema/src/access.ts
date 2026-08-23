import { Schema } from "effect";
import { EvidenceId, SourceAccess } from "./schemas.js";

/**
 * Verifying what a source actually serves, rather than trusting how it was
 * classified.
 *
 * Every `access` value in the system began as an agent's reading of a landing
 * page. The classification is load-bearing — runnability derives from it, the
 * catalog advertises on it, and acquisition refuses on it — so it needs to be
 * checkable. These are the signals a probe can observe and the rules for
 * reading them; the acquisitions that produce the signals live in the engine,
 * because deciding what they mean is pure and should stay testable without a
 * network.
 */

/** What one probe saw. */
export class AccessSignals extends Schema.Class<AccessSignals>("AccessSignals")(
  {
    /** Whether this deployment could render the page as a browser would. */
    browserAvailable: Schema.Boolean,
    /** The content type the source served, or the unspecified-bytes fallback. */
    contentType: Schema.String,
    /**
     * Whether the page's content depends on being rendered. Absent when no
     * browser was available to find out, rather than defaulted — "we did not
     * look" and "we looked and it does not" are different facts.
     */
    jsDependent: Schema.optionalKey(Schema.Boolean),
    /** Whether the body parsed as the machine-readable format it declared. */
    machineReadable: Schema.Boolean,
    /**
     * Why rendering did not happen, when a browser was available and it still
     * could not be tried. "Could not tell" is only useful with the reason.
     */
    renderError: Schema.optionalKey(Schema.String),
    /** Rendered visible text over served visible text, where both were taken. */
    renderedTextRatio: Schema.optionalKey(Schema.Number),
    /** The protocol status, where the transport had one. */
    status: Schema.optionalKey(Schema.Number),
    url: Schema.String,
  }
) {}

/**
 * A classification with the evidence behind it. `evidence` is what separates
 * this from another guess: the artifacts are write-once and content-addressed,
 * so the verdict can be re-derived or disputed rather than believed.
 */
export class AccessObservation extends Schema.Class<AccessObservation>(
  "AccessObservation"
)({
  agrees: Schema.Boolean,
  declared: SourceAccess,
  evidence: Schema.Array(EvidenceId),
  observed: SourceAccess,
  reason: Schema.String,
  signals: AccessSignals,
  sourceId: Schema.String,
}) {}

/** A content type without its parameters, lowercased. */
export const baseContentType = (value: string): string =>
  value.split(";")[0]?.trim().toLowerCase() ?? "";

const isJsonOrXml = (type: string): boolean =>
  type === "application/json" ||
  type === "text/json" ||
  type === "application/xml" ||
  type === "text/xml" ||
  type.endsWith("+json") ||
  type.endsWith("+xml");

const datasetTypes = new Set([
  "application/gzip",
  "application/vnd.apache.parquet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/x-gzip",
  "application/x-ndjson",
  "application/zip",
  "text/csv",
  "text/tab-separated-values",
]);

const htmlTypes = new Set(["application/xhtml+xml", "text/html"]);

const scheme = /^[A-Za-z][\w+.-]*:\/\//;

/**
 * Whether a url addresses a site rather than something within it. Parsed by
 * hand because this package carries no lib types on purpose.
 */
export const isBareHost = (url: string): boolean => {
  const afterScheme = url.replace(scheme, "");
  if (afterScheme.includes("?") || afterScheme.includes("#")) {
    return false;
  }
  const slash = afterScheme.indexOf("/");
  return slash === -1 || afterScheme.slice(slash).replaceAll("/", "") === "";
};

const UNSPECIFIED = "application/octet-stream";

export interface AccessVerdict {
  readonly access: SourceAccess;
  readonly reason: string;
}

/**
 * Read the signals. Pure, so every rule is testable without a network — which
 * is what keeps them honest as they accumulate.
 *
 * The order matters: a credential wall is usually served as HTML, so testing
 * representation first would classify a key-gated API as a scrapable page.
 * Authentication is a fact about reachability and outranks a fact about format.
 */
export const classifyAccess = (signals: AccessSignals): AccessVerdict => {
  const { status } = signals;
  if (status === 401) {
    return {
      access: "requires_key",
      reason: "the endpoint rejected an unauthenticated request with 401",
    };
  }
  // A 403 is *forbidden*, for any reason: it is what a credential wall answers
  // and equally what a site answers to a client it does not like. Measured — a
  // sweep of the catalog drew 403s from three large sites that block
  // unidentified clients rather than three key-gated APIs. Reading it as
  // `requires_key` would assert a credential requirement nobody established.
  if (status === 403) {
    return {
      access: "unknown",
      reason:
        "the endpoint answered 403, which a credential wall and a blocked client produce alike, so what it requires was not established",
    };
  }
  if (status !== undefined && status >= 400) {
    return {
      access: "unknown",
      reason: `the endpoint answered ${status}, so what it serves could not be observed`,
    };
  }

  const type = baseContentType(signals.contentType);

  if (isJsonOrXml(type)) {
    return signals.machineReadable
      ? {
          access: "open_api",
          reason: `the endpoint served ${type} that parsed`,
        }
      : {
          access: "unknown",
          reason: `the endpoint declared ${type} but the body did not parse as it`,
        };
  }

  if (datasetTypes.has(type)) {
    return {
      access: "dataset",
      reason: `the endpoint served ${type}, a downloadable dataset format`,
    };
  }

  if (htmlTypes.has(type)) {
    // A site's front door serves a page whatever its data interface is, so an
    // HTML response from one says nothing about the source's access.
    //
    // This is not a corner case: a sweep of the catalog found 31 of 38 specs
    // pointing at a bare host and the other 7 at landing pages, so every single
    // source served HTML. Read naively, that would have counselled reclassifying
    // most of the catalog as browser-only — turning well-known APIs into
    // sources a browser-less deployment refuses to run. Refusing to classify is
    // the only honest reading, and it names what would fix it.
    if (isBareHost(signals.url)) {
      return {
        access: "unknown",
        reason:
          "the probed url is the site's front door, which serves a page whatever the source's data interface is; point the spec at an endpoint to classify it",
      };
    }
    // The vocabulary has no value for "a page, but reachable without a
    // browser", so `jsDependent` carries that distinction in the signals
    // instead of being flattened into the verdict.
    if (signals.jsDependent === true) {
      return {
        access: "browser_scrape",
        reason:
          "the endpoint served a page whose content only appears once rendered",
      };
    }
    if (signals.jsDependent === false) {
      return {
        access: "browser_scrape",
        reason:
          "the endpoint served a page; its content is present without rendering, so an http transport can reach it",
      };
    }
    // Three distinct facts, not two: we did not look, we looked and it does
    // not need rendering, and we looked and could not tell. Claiming the first
    // when the third happened is the kind of quiet inaccuracy this whole change
    // exists to remove.
    return {
      access: "browser_scrape",
      reason: signals.browserAvailable
        ? "the endpoint served a page, and rendering it to test whether its content needs a browser did not succeed"
        : "the endpoint served a page, and no browser was available to test whether its content needs rendering",
    };
  }

  if (type === UNSPECIFIED || type === "") {
    return {
      access: "unknown",
      reason:
        "the endpoint declared no content type, so what it serves cannot be told from the response",
    };
  }

  return {
    access: "unknown",
    reason: `the endpoint served ${type}, which does not correspond to a known access kind`,
  };
};
