import { useEffect, useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";
import type { FormShape } from "../form.js";
import { formShapeOf } from "../form.js";
import { SchemaForm } from "../SchemaForm.js";

interface Step {
  readonly evidenceIds: readonly string[];
  readonly id: string;
  readonly operation: { readonly _tag: string };
}

const messageOf = (cause: unknown): string =>
  cause instanceof OperationFailure ? cause.message : String(cause);

/**
 * Run a transform by catalog id, from a form generated out of its published
 * contract. Running *stages*; committing is a separate, deliberate act, because
 * that split is the provenance model — steps carry the evidence they derive
 * from, and an investigator decides whether the derivation is sound before it
 * enters the graph.
 */
export const LauncherView = ({
  client,
  transformId,
}: {
  readonly client: Client;
  readonly transformId: string | null;
}) => {
  const [shape, setShape] = useState<FormShape | null>(null);
  const [staged, setStaged] = useState<readonly Step[]>([]);
  const [committed, setCommitted] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (transformId === null) {
      return;
    }
    setShape(null);
    setStaged([]);
    setCommitted([]);
    setError(null);
    client
      .call("catalog_describe", { id: transformId })
      .then((detail) => {
        setShape(formShapeOf((detail as { input?: unknown }).input));
      })
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [client, transformId]);

  if (transformId === null) {
    return <p className="hint">Pick a transform from the catalog.</p>;
  }

  const run = (args: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    client
      .call("run_transform", { input: args, transformId })
      .then((result) => {
        setStaged(result as readonly Step[]);
        setCommitted([]);
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(false));
  };

  const commit = () => {
    setPending(true);
    setError(null);
    Promise.all(staged.map((step) => client.call("insert", { step })))
      .then(() => setCommitted(staged.map((step) => step.id)))
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(false));
  };

  return (
    <div>
      <h2>{transformId}</h2>
      {shape === null ? (
        <p className="hint">Loading contract…</p>
      ) : (
        <SchemaForm
          onSubmit={run}
          pending={pending}
          shape={shape}
          transformId={transformId}
        />
      )}
      {error === null ? null : <p className="error">{error}</p>}

      {staged.length === 0 ? null : (
        <section>
          <h3>
            Staged — {staged.length} step{staged.length === 1 ? "" : "s"}, not
            yet in the graph
          </h3>
          <table>
            <thead>
              <tr>
                <th>step</th>
                <th>operation</th>
                <th>evidence</th>
              </tr>
            </thead>
            <tbody>
              {staged.map((step) => (
                <tr key={step.id}>
                  <td>{step.id}</td>
                  <td>{step.operation._tag}</td>
                  <td>{step.evidenceIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button disabled={pending} onClick={commit} type="button">
            {pending ? "Committing…" : "Commit to graph"}
          </button>
          {committed.length === 0 ? null : (
            <p className="ok">Committed {committed.length}.</p>
          )}
        </section>
      )}
    </div>
  );
};
