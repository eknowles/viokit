import { useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";

/**
 * The engine's graph surfaces, presented without interpreting them in domain
 * terms — the console knows nothing about what a "domain" or a "certificate"
 * means, and shows what the engine returns.
 *
 * Tables, not a canvas: this change buys the ability to drive the engine from a
 * screen, not to visualise a 4D graph. That is its own design problem.
 */

type QueryName =
  | "query_entity"
  | "paths"
  | "timeline"
  | "spatial"
  | "relatedness"
  | "replay"
  | "log";

const QUERIES: readonly {
  readonly args: readonly string[];
  readonly name: QueryName;
}[] = [
  { args: ["id"], name: "query_entity" },
  { args: ["from", "to", "maxDepth"], name: "paths" },
  { args: ["from", "to"], name: "timeline" },
  { args: ["minLat", "minLon", "maxLat", "maxLon"], name: "spatial" },
  { args: ["seed", "maxDepth"], name: "relatedness" },
  { args: [], name: "replay" },
  { args: [], name: "log" },
];

const NUMERIC = new Set(["maxDepth", "minLat", "minLon", "maxLat", "maxLon"]);

const isEmpty = (result: unknown): boolean =>
  result === null ||
  (Array.isArray(result) && result.length === 0) ||
  (typeof result === "object" &&
    result !== null &&
    "_tag" in result &&
    (result as { _tag: string })._tag === "None");

const Result = ({ result }: { readonly result: unknown }) => {
  if (result === undefined) {
    return null;
  }
  if (isEmpty(result)) {
    return <p className="hint">No results.</p>;
  }
  return <pre>{JSON.stringify(result, null, 2)}</pre>;
};

export const GraphView = ({ client }: { readonly client: Client }) => {
  const [query, setQuery] = useState<QueryName>("query_entity");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const spec = QUERIES.find((q) => q.name === query);

  const run = () => {
    setPending(true);
    setError(null);
    setResult(undefined);
    const args: Record<string, unknown> = {};
    for (const arg of spec?.args ?? []) {
      const raw = values[arg];
      if (raw === undefined || raw === "") {
        continue;
      }
      args[arg] = NUMERIC.has(arg) ? Number(raw) : raw;
    }
    client
      .call(query, args)
      .then(setResult)
      .catch((cause: unknown) =>
        setError(
          cause instanceof OperationFailure ? cause.message : String(cause)
        )
      )
      .finally(() => setPending(false));
  };

  return (
    <div>
      <div className="form">
        <label htmlFor="query">
          <span className="label">query</span>
          <select
            id="query"
            onChange={(e) => {
              setQuery(e.target.value as QueryName);
              setValues({});
              setResult(undefined);
            }}
            value={query}
          >
            {QUERIES.map((q) => (
              <option key={q.name} value={q.name}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
        {(spec?.args ?? []).map((arg) => (
          <label htmlFor={`graph-${arg}`} key={arg}>
            <span className="label">{arg}</span>
            <input
              id={`graph-${arg}`}
              onChange={(e) =>
                setValues((current) => ({ ...current, [arg]: e.target.value }))
              }
              type={NUMERIC.has(arg) ? "number" : "text"}
              value={values[arg] ?? ""}
            />
          </label>
        ))}
        <button disabled={pending} onClick={run} type="button">
          {pending ? "Querying…" : "Run query"}
        </button>
      </div>

      {error === null ? null : <p className="error">{error}</p>}
      <Result result={result} />
    </div>
  );
};
