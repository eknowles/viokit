import {
  AppShell,
  Pane,
  Rail,
  StatusLine,
  ThemeToggle,
  TopBar,
  Workspace,
} from "@viokit/ui";
import { useEffect, useMemo, useState } from "react";
import {
  cameraAtom,
  caseSelectionAtom,
  curationAtom,
  graphSelectionAtom,
  graphTimeAtom,
  runnableOnlyAtom,
  selectedTransformAtom,
  useAtom,
  viewAtom,
} from "./atoms.js";
import type { Curation } from "./case-table.js";
import type { Client, OperationDeclaration } from "./client.js";
import { defaultOrigin, makeClient, OperationFailure } from "./client.js";
import type { ViewName } from "./navigation.js";
import {
  asViewName,
  DEFAULT_VIEW,
  isTyping,
  shortcutOf,
  VIEWS,
  viewForShortcut,
} from "./navigation.js";
import {
  type ConsoleViewState,
  debounce,
  loadViewState,
  type StoredCamera,
  saveViewState,
} from "./persistence.js";
import type { Subject } from "./provenance.js";
import { CaseView } from "./views/Case.js";
import { CatalogView } from "./views/Catalog.js";
import { EvidenceView } from "./views/Evidence.js";
import { GraphView } from "./views/Graph.js";
import { GraphCanvasView } from "./views/GraphCanvas.js";
import { InvestigationBar } from "./views/Investigations.js";
import { LauncherView } from "./views/Launcher.js";

/** Operations the console needs; missing ones are reported loudly on load. */
const REQUIRED = [
  "catalog_list",
  "catalog_describe",
  "run_transform",
  "insert",
  "ingest",
  "query_entity",
  "investigations",
  "current_investigation",
  "open_investigation",
];

const Body = ({
  camera,
  client,
  onCamera,
  view,
  caseSelection,
  curation,
  onCaseSelect,
  onCurate,
  graphSelection,
  graphTime,
  onGraphSelect,
  onGraphTime,
  onLaunch,
  onRunnableOnly,
  runnableOnly,
  transformId,
}: {
  readonly camera: StoredCamera | null;
  readonly caseSelection: string | null;
  readonly client: Client;
  readonly onCamera: (camera: StoredCamera) => void;
  readonly curation: Curation;
  readonly onCaseSelect: (id: string | null) => void;
  readonly onCurate: (next: Curation) => void;
  readonly onLaunch: (id: string) => void;
  readonly graphSelection: Subject | null;
  readonly graphTime: number | null;
  readonly onGraphSelect: (subject: Subject | null) => void;
  readonly onGraphTime: (at: number | null) => void;
  readonly onRunnableOnly: (value: boolean) => void;
  readonly runnableOnly: boolean;
  readonly transformId: string | null;
  readonly view: ViewName;
}) => {
  if (view === "case") {
    return (
      <CaseView
        camera={camera}
        client={client}
        curation={curation}
        onCamera={onCamera}
        onCurate={onCurate}
        onSelect={onCaseSelect}
        selectedId={caseSelection}
      />
    );
  }
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
        camera={camera}
        client={client}
        onCamera={onCamera}
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
  const [caseSelection, setCaseSelection] = useAtom(caseSelectionAtom);
  const [curation, setCuration] = useAtom(curationAtom);
  const [graphTime, setGraphTime] = useAtom(graphTimeAtom);
  const [camera, setCamera] = useAtom(cameraAtom);
  // Restored before anything is saved, so restoring does not immediately
  // overwrite what it just read.
  const [restored, setRestored] = useState(false);
  // Bumped when the open investigation changes: every view reads under a scope,
  // so switching case must re-read rather than leave the previous one's results
  // on screen looking like this one's.
  const [scope, setScope] = useState(0);

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
      setView(asViewName(state.view) ?? DEFAULT_VIEW);
      setTransformId(state.selectedTransform);
      setRunnableOnly(state.runnableOnly);
      setGraphSelection(state.graphSelection);
      setGraphTime(state.graphTime);
      setCaseSelection(state.caseSelection);
      setCuration(state.curation);
      setCamera(state.camera);
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
    setCaseSelection,
    setCuration,
    setCamera,
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
      camera,
      caseSelection,
      curation,
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
    caseSelection,
    curation,
    camera,
  ]);

  /*
   * Digit shortcuts, matching the rail's order and the hints it shows.
   * Registered on the window so they work wherever focus is — except in a
   * field, where the keystroke belongs to whoever is typing.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (isTyping(event.target)) {
        return;
      }
      const next = viewForShortcut(event.key);
      if (next !== null) {
        event.preventDefault();
        setView(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  const active = VIEWS.find((entry) => entry.name === view);
  // A deployment that is missing operations is not "connected" in any useful
  // sense, so the status dot reports reachability rather than mere page load.
  const reachable = available.length > 0 && problem === null;

  return (
    <AppShell
      rail={
        <Rail
          items={VIEWS.map((entry) => ({
            hint: shortcutOf(entry.name),
            icon: entry.icon,
            id: entry.name,
            label: entry.label,
          }))}
          onChange={(id) => setView(id as ViewName)}
          value={view}
        />
      }
    >
      {/* The current view is named here rather than in a pane header, so the
          answer to "where am I" is in the same place on every view — the case
          workbench has its own panes and was the one view that never said. */}
      <TopBar
        actions={<ThemeToggle fallback="dark" />}
        subtitle={active?.title ?? "console"}
        title="viokit"
      >
        <InvestigationBar
          client={client}
          onChange={() => setScope((previous) => previous + 1)}
        />
        <StatusLine busy={reachable}>
          {origin} · {available.length} operations
        </StatusLine>
      </TopBar>

      {view === "case" ? (
        <>
          {problem === null ? null : (
            <p className="error console-view">{problem}</p>
          )}
          <Body
            camera={camera}
            caseSelection={caseSelection}
            client={client}
            curation={curation}
            graphSelection={graphSelection}
            graphTime={graphTime}
            key={scope}
            onCamera={setCamera}
            onCaseSelect={setCaseSelection}
            onCurate={setCuration}
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
        </>
      ) : (
        <Workspace wide>
          <Pane
            right="view state persisted server-side · I12"
            title={active?.title ?? "console"}
          >
            {problem === null ? null : (
              <p className="error console-view">{problem}</p>
            )}
            <div
              className={
                view === "catalog"
                  ? "console-view console-view--flush"
                  : "console-view"
              }
            >
              <Body
                camera={camera}
                caseSelection={caseSelection}
                client={client}
                curation={curation}
                graphSelection={graphSelection}
                graphTime={graphTime}
                key={scope}
                onCamera={setCamera}
                onCaseSelect={setCaseSelection}
                onCurate={setCuration}
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
            </div>
          </Pane>
        </Workspace>
      )}
    </AppShell>
  );
};
