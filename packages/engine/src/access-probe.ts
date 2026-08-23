import type {
  EgressDisabledError,
  Evidence,
  EvidenceId,
  EvidenceWriteError,
  OfflineCacheMiss,
  RateLimited,
  RetryExhausted,
  SourceError,
  SourceNotRunnable,
  SourceSpec,
  UnboundParameter,
  UnknownCatalogEntry,
} from "@viokit/schema";
import {
  AccessObservation,
  AccessSignals,
  baseContentType,
  CatalogService,
  classifyAccess,
  SourceRuntimeService,
  SourceSpec as SourceSpecSchema,
  TransportCapabilities,
} from "@viokit/schema";
import { Effect, Option } from "effect";
import { EvidenceService } from "./evidence.js";

/**
 * Verifying a source's access classification against what it actually serves.
 *
 * Every `access` value in the catalog began as an agent's reading of a landing
 * page, and the classification is load-bearing: runnability derives from it,
 * the catalog advertises on it, and browser acquisition is selected by it. This
 * acquires the source and reports what the response says it is.
 *
 * The acquisitions go through `SourceRuntime` like any other, so cache mode,
 * egress route, rate limit, and credential resolution all apply — a probe that
 * fetched directly would be exactly the bypass I4/I10 forbid.
 */

export type ProbeError =
  | UnknownCatalogEntry
  | SourceError
  | EgressDisabledError
  | OfflineCacheMiss
  | RateLimited
  | RetryExhausted
  | SourceNotRunnable
  | UnboundParameter
  | EvidenceWriteError;

/**
 * How much more visible text a rendered page must carry before its content is
 * called render-dependent. A page that merely hydrates existing markup will sit
 * near 1; one whose body arrives empty and is filled by script will be far
 * above it. The ratio itself is reported, so a reader can see how marginal a
 * call was rather than only its conclusion.
 */
const JS_DEPENDENCE_RATIO = 1.5;

const decoder = new TextDecoder();

/** Visible text, roughly: tags removed, whitespace collapsed. */
export const visibleText = (html: string): string =>
  html
    .replaceAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

const parsesAs = (type: string, bytes: Uint8Array): boolean => {
  const body = decoder.decode(bytes).trim();
  if (type.endsWith("json")) {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }
  if (type.endsWith("xml")) {
    return body.startsWith("<");
  }
  return false;
};

const isHtml = (type: string): boolean =>
  type === "text/html" || type === "application/xhtml+xml";

/**
 * The same url, fetched as a browser would render it. Only meaningful for a
 * page, and only possible where the deployment provides a browser — where it
 * does not, the observation says so rather than assuming either answer.
 */
interface RenderAttempt {
  readonly error?: string;
  readonly text?: string;
}

const renderedText = (
  source: SourceSpec,
  params: Record<string, unknown>
): Effect.Effect<RenderAttempt, never, SourceRuntimeService> =>
  Effect.gen(function* () {
    const runtime = yield* SourceRuntimeService;
    const asBrowser = SourceSpecSchema.make({
      ...source,
      access: "browser_scrape",
      id: `${source.id}#rendered`,
      transport: "browser",
    });
    const rendered = yield* Effect.result(runtime.run(asBrowser, params));
    if (rendered._tag === "Success") {
      return { text: visibleText(decoder.decode(rendered.success.bytes)) };
    }
    // Swallowing this was hiding a real failure behind "could not tell".
    const failure: unknown = rendered.failure;
    return {
      error:
        typeof failure === "object" && failure !== null && "message" in failure
          ? String((failure as { message: unknown }).message)
          : String(failure),
    };
  });

export const verifyAccess = (
  sourceId: string,
  /**
   * Binds the source's url placeholders. A parameterised source cannot be
   * probed without knowing what to ask it about, and inventing a value would
   * make the observation about a request nobody chose.
   */
  params: Record<string, unknown> = {}
): Effect.Effect<
  AccessObservation,
  ProbeError,
  | CatalogService
  | SourceRuntimeService
  | TransportCapabilities
  | EvidenceService
> =>
  Effect.gen(function* () {
    const catalog = yield* CatalogService;
    const source = yield* catalog.source(sourceId);
    const runtime = yield* SourceRuntimeService;
    const store = yield* EvidenceService;

    // Acquire and store, exactly as `Engine.acquire` does: the observation's
    // worth is that its artifacts are in the evidence store, addressable and
    // write-once, so the verdict can be re-derived from them.
    //
    // The probe runs against a spec whose `access` is cleared, because
    // runnability refuses on `access` — and refusing to fetch a source because
    // of the very claim being tested is circular. It is also the common case
    // rather than a corner: most sources classified `browser_scrape` declare an
    // http transport, so a browser-less deployment would refuse to check
    // precisely the classifications least likely to be right. `transport` is
    // left alone, since that is a real capability requirement rather than a
    // claim, and a declared credential that does not resolve still refuses.
    // Probed *without* the credential, and without the declared access.
    //
    // Access describes what reaching a source requires, so observing it while
    // holding a key answers a different question: the first two credentialed
    // sources both classified as `open_api` because the probe presented their
    // key and got a 200. Clearing `auth` asks what an unauthenticated caller
    // would meet, which is what the classification is about.
    const { auth: _withheld, ...unauthenticated } = source;
    const probeSpec = SourceSpecSchema.make({
      ...unauthenticated,
      access: "unknown",
    });
    const acquired: Evidence = yield* store.put(
      yield* runtime.run(probeSpec, params)
    );
    const evidence: EvidenceId[] = [acquired.id];

    const type = baseContentType(acquired.contentType);
    const capabilities = Option.getOrElse(
      yield* Effect.serviceOption(TransportCapabilities),
      (): readonly string[] => []
    );
    const browserAvailable = capabilities.includes("browser");

    let jsDependent: boolean | undefined;
    let renderedTextRatio: number | undefined;
    let renderError: string | undefined;

    if (isHtml(type) && browserAvailable) {
      const served = visibleText(decoder.decode(acquired.bytes));
      const attempt = yield* renderedText(source, params);
      renderError = attempt.error;
      if (attempt.text !== undefined) {
        // A served page with no text at all is the strongest possible signal:
        // everything it shows must come from somewhere else.
        renderedTextRatio =
          served.length === 0
            ? attempt.text.length
            : attempt.text.length / served.length;
        jsDependent = renderedTextRatio >= JS_DEPENDENCE_RATIO;
      }
    }

    const signals = AccessSignals.make({
      browserAvailable,
      contentType: acquired.contentType,
      ...(jsDependent === undefined ? {} : { jsDependent }),
      machineReadable: parsesAs(type, acquired.bytes),
      ...(renderError === undefined ? {} : { renderError }),
      ...(renderedTextRatio === undefined ? {} : { renderedTextRatio }),
      ...(acquired.status === undefined ? {} : { status: acquired.status }),
      url: source.url,
    });

    const verdict = classifyAccess(signals);
    const declared = source.access ?? "unknown";

    return AccessObservation.make({
      // A verdict that disagrees is reported, never applied: the spec may be
      // right and the probed url unrepresentative, and only a person or an
      // agent with more context can tell which.
      agrees: verdict.access === declared,
      declared,
      evidence,
      observed: verdict.access,
      reason: verdict.reason,
      signals,
      sourceId,
    });
  });
