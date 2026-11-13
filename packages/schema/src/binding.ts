import { Schema } from "effect";
import { refusalFor } from "./param-types.js";
import type { ExecSpec, SourceSpec } from "./schemas.js";
import {
  ExecSpec as ExecSpecClass,
  SourceSpec as SourceSpecClass,
} from "./schemas.js";

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
 * Bind `{name}` placeholders in an exec source's argument vector, element by
 * element. A placeholder is replaced inside its element and never split,
 * quoted or joined, so the value reaches the command as part of one argument.
 *
 * Only declared parameters are read from `params`: an input the source does not
 * declare is never looked at, so a caller cannot add arguments. Failure reuses
 * `UnboundParameter` so the runtime's error channel is unchanged; the message
 * names the parameter and, for a bad value, the type.
 */
const bindExec = (
  source: SourceSpec,
  exec: ExecSpec,
  params: Record<string, unknown>
): ExecSpec | UnboundParameter => {
  const failure = (reason: string) =>
    new UnboundParameter({
      message: `source '${source.id}' cannot be bound: ${reason}`,
    });
  const args: string[] = [];
  for (const template of exec.args) {
    let refusal: string | undefined;
    const arg = template.replaceAll(PLACEHOLDER, (_match, name: string) => {
      const param = exec.params.find((one) => one.name === name);
      if (param === undefined) {
        refusal ??= `placeholder '${name}' has no declared parameter`;
        return "";
      }
      const value = params[name];
      if (value === undefined || value === null || value === "") {
        refusal ??= `missing parameter '${name}'`;
        return "";
      }
      refusal ??= refusalFor(param, value);
      return String(value);
    });
    if (refusal !== undefined) {
      return failure(refusal);
    }
    args.push(arg);
  }
  return ExecSpecClass.make({ ...exec, args });
};

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
  if (source.exec === undefined) {
    return SourceSpecClass.make({ ...source, url });
  }
  const exec = bindExec(source, source.exec, params);
  if (exec instanceof UnboundParameter) {
    return exec;
  }
  return SourceSpecClass.make({ ...source, exec, url });
};
