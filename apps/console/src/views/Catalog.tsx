import {
  BlankSlate,
  Button,
  DataGrid,
  type DataGridColumn,
  FilterChip,
  Toolbar,
} from "@viokit/ui";
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

/**
 * The grid keys on `${kind}:${id}` because ids are only unique within a kind —
 * a source and a transform may legitimately share one.
 */
const rowKey = (entry: Entry): string => `${entry.kind}:${entry.id}`;

/** The grid's row shape: the catalog entry plus the composite key it needs. */
type Row = Entry & { readonly catalogId: string; readonly id: string };

const COLUMNS = (
  onLaunch: (id: string) => void
): readonly DataGridColumn<Row>[] => [
  {
    key: "id",
    label: "id",
    render: (entry) => (
      <>
        <strong>{entry.catalogId}</strong>
        {entry.description === undefined ? null : (
          <div className="hint">{entry.description}</div>
        )}
      </>
    ),
    strong: true,
  },
  {
    dim: true,
    key: "kind",
    label: "kind",
    render: (entry) =>
      entry.archetype === undefined
        ? entry.kind
        : `${entry.kind} · ${entry.archetype}`,
  },
  {
    dim: true,
    key: "pack",
    label: "pack",
    render: (entry) => entry.pack ?? "—",
  },
  {
    dim: true,
    key: "access",
    label: "access",
    mono: true,
    render: (entry) => entry.access ?? "—",
  },
  {
    key: "status",
    label: "status",
    render: (entry) => (
      <>
        <Status reason={entry.reason} runnable={entry.runnable} />
        {entry.reason === undefined ? null : (
          <div className="hint">{entry.reason}</div>
        )}
      </>
    ),
  },
  {
    align: "right",
    key: "launch",
    label: "",
    render: (entry) =>
      entry.kind === "transform" ? (
        <Button onClick={() => onLaunch(entry.catalogId)} tone="line">
          launch
        </Button>
      ) : null,
  },
];

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
    return <p className="error console-view">{error}</p>;
  }
  if (entries === null) {
    return <BlankSlate note="reading the catalog…" />;
  }

  const rows: readonly Row[] = entries.map((entry) => ({
    ...entry,
    catalogId: entry.id,
    id: rowKey(entry),
  }));

  return (
    <>
      <Toolbar
        right={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}${runnableOnly ? " · runnable only" : ""}`}
      >
        <FilterChip on={!runnableOnly} onClick={() => onRunnableOnly(false)}>
          everything
        </FilterChip>
        <FilterChip on={runnableOnly} onClick={() => onRunnableOnly(true)}>
          runnable here
        </FilterChip>
      </Toolbar>
      {rows.length === 0 ? (
        <BlankSlate
          icon="library"
          note={
            runnableOnly
              ? "nothing registered on this deployment can run here — the filter is on"
              : "nothing is registered on this deployment"
          }
          title="Empty catalog"
        />
      ) : (
        <DataGrid columns={COLUMNS(onLaunch)} rows={rows} />
      )}
    </>
  );
};
