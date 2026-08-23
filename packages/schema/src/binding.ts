import { Schema } from "effect";
import type { SourceSpec } from "./schemas.js";
import { SourceSpec as SourceSpecClass } from "./schemas.js";

/**
 * Binding a source to the thing being asked about.
 *
 * Until this existed a `SourceSpec` could only ever fetch one fixed URL, so a
 * transform's input never reached the acquisition — which is why the one
 * transform in the catalog derived its output from the input string rather than
 * from any response. A lookup could not be expressed at all.
 *
 * A url may carry `{name}` placeholders. Binding produces a concrete spec, and
 * everything downstream — cache fingerprint, egress, transport — is untouched:
 * the fingerprint already hashes the url, so two domains get two cache entries
 * without the cache having to know parameters exist.
 */

const PLACEHOLDER = /\{(\w+)\}/g;

export class UnboundParameter extends Schema.TaggedErrorClass<UnboundParameter>()(
  "UnboundParameter",
  {
    message: Schema.String,
  }
) {}

/** The placeholders a source declares, in the order they appear. */
export const parametersOf = (url: string): readonly string[] => [
  ...new Set([...url.matchAll(PLACEHOLDER)].map((match) => match[1] as string)),
];

/**
 * Substitute `{name}` from `params`, percent-encoded.
 *
 * An unbound placeholder is a failure, not a pass-through: leaving `{hostname}`
 * in the url would fetch a nonsense address and record the result as evidence,
 * which is exactly the kind of confidently-wrong answer this codebase keeps
 * finding.
 */
export const bindSource = (
  source: SourceSpec,
  params: Record<string, unknown> = {}
): SourceSpec | UnboundParameter => {
  const missing: string[] = [];
  const url = source.url.replaceAll(PLACEHOLDER, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === "") {
      missing.push(name);
      return "";
    }
    return encodeURIComponent(String(value));
  });

  if (missing.length > 0) {
    return new UnboundParameter({
      message: `source '${source.id}' needs ${missing
        .map((name) => `'${name}'`)
        .join(", ")} to build its url`,
    });
  }
  return SourceSpecClass.make({ ...source, url });
};
