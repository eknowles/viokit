import { useEffect, useMemo, useState } from "react";
import {
  graphSelectionAtom,
  graphTimeAtom,
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
import { GraphCanvasView } from "./views/GraphCanvas.js";
import { LauncherView } from "./views/Launcher.js";

const VIEWS: readonly { readonly label: string; readonly name: ViewName }[] = [
  { label: "Catalog", name: "catalog" },
  { label: "Transform", name: "launcher" },
  { label: "Evidence", name: "evidence" },
  { label: "Graph", name: "graph" },
  { label: "Canvas", name: "canvas" },
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
  graphSelection,
  graphTime,
  onGraphSelect,
  onGraphTime,
  onLaunch,
  onRunnableOnly,
  runnableOnly,
  transformId,
}: {
  readonly client: Client;
  readonly onLaunch: (id: string) => void;
  readonly graphSelection: string | null;
  readonly graphTime: number | null;
  readonly onGraphSelect: (id: string | null) => void;
  readonly onGraphTime: (at: number | null) => void;
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
  if (view === "canvas") {
    return (
      <GraphCanvasView
        client={client}
        onSelect={onGraphSelect}
        onTime={onGraphTime}
        selected={graphSelection}
        time={graphTime}
      />
    );
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
  const [graphSelection, setGraphSelection] = useAtom(graphSelectionAtom);
  const [graphTime, setGraphTime] = useAtom(graphTimeAtom);
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
      setGraphSelection(state.graphSelection);
      setGraphTime(state.graphTime);
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    setView,
    setTransformId,
    setRunnableOnly,
    setGraphSelection,
    setGraphTime,
  ]);

  const persist = useMemo(
    () =>
      debounce((state: ConsoleViewState) => saveViewState(client, state), 400),
    [client]
  );

  useEffect(() => {
    if (!restored) {
      return;
    }
    persist({
      graphSelection,
      graphTime,
      runnableOnly,
      selectedTransform: transformId,
      view,
    });
  }, [
    persist,
    restored,
    runnableOnly,
    transformId,
    view,
    graphSelection,
    graphTime,
  ]);

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
          graphSelection={graphSelection}
          graphTime={graphTime}
          onGraphSelect={setGraphSelection}
          onGraphTime={setGraphTime}
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
