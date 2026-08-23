import { useEffect, useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";

interface Entry {
  readonly access?: string;
  readonly archetype?: string;
  readonly description?: string;
  readonly id: string;
  readonly kind: string;
  readonly pack?: string;
  readonly reason?: string;
  readonly runnable?: boolean;
}

/**
 * What this deployment can do, as the deployment reports it — no hardcoded
 * knowledge of any source or transform. A source that cannot be acquired here
 * is shown with its reason rather than hidden, so a browser-gated source reads
 * differently from a missing one.
 */
const Status = ({
  reason,
  runnable,
}: {
  readonly reason: string | undefined;
  readonly runnable: boolean | undefined;
}) => {
  if (runnable === undefined) {
    return <>—</>;
  }
  if (runnable) {
    return <span className="ok">runnable</span>;
  }
  return (
    <span className="blocked" title={reason}>
      blocked
    </span>
  );
};

export const CatalogView = ({
  client,
  onLaunch,
  onRunnableOnly,
  runnableOnly,
}: {
  readonly client: Client;
  readonly onLaunch: (transformId: string) => void;
  readonly onRunnableOnly: (value: boolean) => void;
  readonly runnableOnly: boolean;
}) => {
  const [entries, setEntries] = useState<readonly Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const args = runnableOnly ? { kind: "source", runnable: true } : {};
    client
      .call("catalog_list", args)
      .then((result) => {
        if (!cancelled) {
          setEntries(result as readonly Entry[]);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof OperationFailure ? cause.message : String(cause)
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, runnableOnly]);

  if (error !== null) {
    return <p className="error">{error}</p>;
  }
  if (entries === null) {
    return <p className="hint">Loading…</p>;
  }
  if (entries.length === 0) {
    return (
      <p className="hint">
        Nothing registered on this deployment
        {runnableOnly ? " is runnable" : ""}.
      </p>
    );
  }

  return (
    <div>
      <label className="toggle" htmlFor="runnable-only">
        <input
          checked={runnableOnly}
          id="runnable-only"
          onChange={(e) => onRunnableOnly(e.target.checked)}
          type="checkbox"
        />
        only what can run here
      </label>
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>kind</th>
            <th>pack</th>
            <th>access</th>
            <th>status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.kind}:${entry.id}`}>
              <td>
                <strong>{entry.id}</strong>
                {entry.description === undefined ? null : (
                  <div className="hint">{entry.description}</div>
                )}
              </td>
              <td>
                {entry.kind}
                {entry.archetype === undefined ? "" : ` · ${entry.archetype}`}
              </td>
              <td>{entry.pack ?? "—"}</td>
              <td>{entry.access ?? "—"}</td>
              <td>
                <Status reason={entry.reason} runnable={entry.runnable} />
                {entry.reason === undefined ? null : (
                  <div className="hint">{entry.reason}</div>
                )}
              </td>
              <td>
                {entry.kind === "transform" ? (
                  <button onClick={() => onLaunch(entry.id)} type="button">
                    launch
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
