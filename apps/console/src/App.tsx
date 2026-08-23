import { useEffect, useMemo, useState } from "react";
import {
  runnableOnlyAtom,
  selectedTransformAtom,
  useAtom,
  type ViewName,
  viewAtom,
} from "./atoms.js";
import type { Client, OperationDeclaration } from "./client.js";
import { defaultOrigin, makeClient, OperationFailure } from "./client.js";
import {
  type ConsoleViewState,
  debounce,
  loadViewState,
  saveViewState,
} from "./persistence.js";
import { CatalogView } from "./views/Catalog.js";
import { EvidenceView } from "./views/Evidence.js";
import { GraphView } from "./views/Graph.js";
import { LauncherView } from "./views/Launcher.js";

const VIEWS: readonly { readonly label: string; readonly name: ViewName }[] = [
  { label: "Catalog", name: "catalog" },
  { label: "Transform", name: "launcher" },
  { label: "Evidence", name: "evidence" },
  { label: "Graph", name: "graph" },
];

/** Operations the console needs; missing ones are reported loudly on load. */
const REQUIRED = [
  "catalog_list",
  "catalog_describe",
  "run_transform",
  "insert",
  "ingest",
  "query_entity",
];

const Body = ({
  client,
  view,
  onLaunch,
  onRunnableOnly,
  runnableOnly,
  transformId,
}: {
  readonly client: Client;
  readonly onLaunch: (id: string) => void;
  readonly onRunnableOnly: (value: boolean) => void;
  readonly runnableOnly: boolean;
  readonly transformId: string | null;
  readonly view: ViewName;
}) => {
  if (view === "catalog") {
    return (
      <CatalogView
        client={client}
        onLaunch={onLaunch}
        onRunnableOnly={onRunnableOnly}
        runnableOnly={runnableOnly}
      />
    );
  }
  if (view === "launcher") {
    return <LauncherView client={client} transformId={transformId} />;
  }
  if (view === "evidence") {
    return <EvidenceView client={client} />;
  }
  return <GraphView client={client} />;
};

export const App = () => {
  const origin =
    (import.meta.env.VITE_VIOKIT_API as string | undefined) ?? defaultOrigin;
  const client = useMemo(() => makeClient({ origin }), [origin]);

  const [view, setView] = useAtom(viewAtom);
  const [transformId, setTransformId] = useAtom(selectedTransformAtom);
  const [available, setAvailable] = useState<readonly OperationDeclaration[]>(
    []
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [runnableOnly, setRunnableOnly] = useAtom(runnableOnlyAtom);
  // Restored before anything is saved, so restoring does not immediately
  // overwrite what it just read.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    client
      .operations()
      .then((operations) => {
        setAvailable(operations);
        const names = new Set(operations.map((o) => o.name));
        const missing = REQUIRED.filter((name) => !names.has(name));
        setProblem(
          missing.length === 0
            ? null
            : `this deployment is missing operations the console needs: ${missing.join(", ")}`
        );
      })
      .catch((cause: unknown) =>
        setProblem(
          cause instanceof OperationFailure ? cause.message : String(cause)
        )
      );
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    loadViewState(client).then((state) => {
      if (cancelled) {
        return;
      }
      setView(state.view as ViewName);
      setTransformId(state.selectedTransform);
      setRunnableOnly(state.runnableOnly);
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [client, setView, setTransformId, setRunnableOnly]);

  const persist = useMemo(
    () =>
      debounce((state: ConsoleViewState) => saveViewState(client, state), 400),
    [client]
  );

  useEffect(() => {
    if (!restored) {
      return;
    }
    persist({ runnableOnly, selectedTransform: transformId, view });
  }, [persist, restored, runnableOnly, transformId, view]);

  return (
    <main>
      <header>
        <h1>viokit</h1>
        <nav>
          {VIEWS.map((entry) => (
            <button
              className={view === entry.name ? "active" : ""}
              key={entry.name}
              onClick={() => setView(entry.name)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <span className="hint">
          {origin} · {available.length} operations
        </span>
      </header>

      {problem === null ? null : <p className="error">{problem}</p>}

      <section>
        <Body
          client={client}
          onLaunch={(id) => {
            setTransformId(id);
            setView("launcher");
          }}
          onRunnableOnly={setRunnableOnly}
          runnableOnly={runnableOnly}
          transformId={transformId}
          view={view}
        />
      </section>

      <footer className="hint">
        View state is stored server-side, schema-encoded and versioned (I12).
      </footer>
    </main>
  );
};
