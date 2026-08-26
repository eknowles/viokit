import {
  BlankSlate,
  Button,
  Canvas,
  Legend,
  Pane,
  PaneStack,
  TextField,
  Workspace,
} from "@viokit/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CaseNode, TransformContract } from "../case.js";
import { entityNode, isRealised, seedNode } from "../case.js";
import type { CaseFilter, Curation, CurationState } from "../case-table.js";
import {
  caseGraphView,
  caseRows,
  curate,
  kindSlots,
  prune,
  summarise,
} from "../case-table.js";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";
import { formShapeOf } from "../form.js";
import type { GraphSnapshot } from "../graph-layout.js";
import { layout } from "../graph-layout.js";
import type { LayoutName } from "../graph-shape.js";
import { suggestLayout } from "../graph-shape.js";
import type { StoredCamera } from "../persistence.js";
import type { StepRecord } from "../provenance.js";
import { CaseOverview } from "./CaseOverview.js";
import { CaseTable } from "./CaseTable.js";
import type { CatalogEntry } from "./Expand.js";
import { ExpandPane, expansionCount, NodeFacts } from "./Expand.js";
import { GraphSurface } from "./GraphSurface.js";

/**
 * Working a case: seed something, expand it, and see what you have.
 *
 * Three surfaces on one selection. The canvas says how the case is *shaped*,
 * the table says what is actually *in* it and what still needs a decision, and
 * the right column says what the selected thing is and what can be run from
 * it. Selecting anywhere selects everywhere — a node picked on the canvas is
 * the row highlighted in the table, because they are the same entity and two
 * separate selections would be two chances to look at the wrong one.
 */

const SIZE = 600;

/** Centred on an empty canvas; out of the way once there is a graph. */
const seedAt = (empty: boolean) =>
  empty ? { x: SIZE / 2, y: SIZE / 2 } : { x: SIZE / 2, y: 34 };

const messageOf = (cause: unknown): string =>
  cause instanceof OperationFailure ? cause.message : String(cause);

/** Every transform this deployment publishes, with its derived contract. */
const readContracts = async (
  client: Client
): Promise<{
  readonly contracts: readonly TransformContract[];
  readonly entries: ReadonlyMap<string, CatalogEntry>;
}> => {
  const listed = (await client.call("catalog_list", {
    kind: "transform",
  })) as readonly CatalogEntry[];
  const described = await Promise.all(
    listed.map(async (entry) => {
      try {
        const detail = (await client.call("catalog_describe", {
          id: entry.id,
        })) as { input?: unknown };
        return { id: entry.id, shape: formShapeOf(detail.input) };
      } catch {
        // A transform whose contract will not describe is left out of the
        // expansion list rather than offered as a mystery.
        return null;
      }
    })
  );
  return {
    contracts: described.filter(
      (one): one is TransformContract => one !== null
    ),
    entries: new Map(listed.map((entry) => [entry.id, entry])),
  };
};

const SeedPrompt = ({
  onSeed,
}: {
  readonly onSeed: (node: CaseNode) => void;
}) => {
  const [value, setValue] = useState("");
  const [kind, setKind] = useState("");
  const submit = () => {
    if (value.trim() !== "") {
      onSeed(seedNode(value, kind));
    }
  };
  return (
    <div className="seed">
      <p className="hint">
        Start the case with something you already know — a domain, a company, a
        name. It is not a finding until a source returns it, so it sits on the
        canvas unevidenced until a transform asserts it.
      </p>
      <TextField
        density="compact"
        id="seed-value"
        label="value"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            submit();
          }
        }}
        placeholder="acme-intel.example"
        value={value}
      />
      <TextField
        density="compact"
        hint="optional — a transform whose input field has this name is an exact fit"
        id="seed-kind"
        label="kind"
        onChange={(e) => setKind(e.target.value)}
        placeholder="domain"
        value={kind}
      />
      <Button disabled={value.trim() === ""} onClick={submit} tone="ink">
        Put it on the canvas
      </Button>
    </div>
  );
};

interface CaseData {
  readonly contracts: readonly TransformContract[];
  readonly entries: ReadonlyMap<string, CatalogEntry>;
  readonly error: string | null;
  /** Log length before the last expansion; anything at or past it is new. */
  readonly freshFrom: number;
  readonly graph: GraphSnapshot | null;
  readonly reload: () => Promise<GraphSnapshot>;
  readonly steps: readonly StepRecord[];
}

/** The case's server-side state: the folded graph, its log, and what can run. */
const useCaseData = (client: Client): CaseData => {
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [steps, setSteps] = useState<readonly StepRecord[]>([]);
  const [freshFrom, setFreshFrom] = useState(Number.POSITIVE_INFINITY);
  const [contracts, setContracts] = useState<readonly TransformContract[]>([]);
  const [entries, setEntries] = useState<ReadonlyMap<string, CatalogEntry>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(
    async (): Promise<readonly [GraphSnapshot, readonly StepRecord[]]> =>
      (await Promise.all([
        client.call("replay") as Promise<GraphSnapshot>,
        client.call("log") as Promise<readonly StepRecord[]>,
      ])) as readonly [GraphSnapshot, readonly StepRecord[]],
    [client]
  );

  /**
   * Re-read after a commit. The log length *before* the re-read is the
   * watermark: everything at or past it is what this expansion just added, so
   * a table of two hundred rows still shows which six are new.
   */
  const reload = useCallback(async (): Promise<GraphSnapshot> => {
    setFreshFrom(steps.length);
    const [state, log] = await read();
    setGraph(state);
    setSteps(log);
    return state;
  }, [read, steps.length]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([read(), readContracts(client)])
      .then(([[state, log], described]) => {
        if (cancelled) {
          return;
        }
        setGraph(state);
        setSteps(log);
        setContracts(described.contracts);
        setEntries(described.entries);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(messageOf(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, read]);

  return { contracts, entries, error, freshFrom, graph, reload, steps };
};

export const CaseView = ({
  camera,
  client,
  curation,
  onCamera,
  onCurate,
  onSelect,
  selectedId,
}: {
  readonly camera: StoredCamera | null;
  readonly client: Client;
  readonly curation: Curation;
  readonly onCamera: (camera: StoredCamera) => void;
  readonly onCurate: (next: Curation) => void;
  readonly onSelect: (id: string | null) => void;
  readonly selectedId: string | null;
}) => {
  const { contracts, entries, error, freshFrom, graph, reload, steps } =
    useCaseData(client);
  const [seed, setSeed] = useState<CaseNode | null>(null);
  const [filter, setFilter] = useState<CaseFilter>("all");
  const [chosenLayout, setChosenLayout] = useState<LayoutName | null>(null);

  // The seed stands in only until something real asserts it, which is what a
  // transform does the first time it runs against the value.
  const liveSeed =
    seed !== null && graph !== null && isRealised(seed, graph) ? null : seed;

  const rows = useMemo(
    () => (graph === null ? [] : caseRows(graph, steps, curation, freshFrom)),
    [curation, freshFrom, graph, steps]
  );
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const slots = useMemo(() => kindSlots(rows), [rows]);
  const summary = useMemo(
    () => summarise(rows, graph?.relations.length ?? 0),
    [graph, rows]
  );

  const placed = useMemo(
    () => (graph === null ? null : layout(graph, { size: SIZE })),
    [graph]
  );

  const canvasView = useMemo(
    () =>
      placed === null
        ? { edges: [], nodes: [] }
        : caseGraphView(placed, {
            byId,
            seed: liveSeed,
            seedPoint: seedAt(graph?.entities.length === 0),
            slots,
          }),
    [byId, graph, liveSeed, placed, slots]
  );

  // Automatic is the default, not the behaviour: the investigator's choice
  // wins once made, so the graph does not rearrange under them.
  const layoutName =
    chosenLayout ?? (graph === null ? "preset" : suggestLayout(graph));

  const selected = useMemo((): CaseNode | null => {
    if (selectedId === null) {
      return null;
    }
    if (liveSeed !== null && liveSeed.id === selectedId) {
      return liveSeed;
    }
    const entity = graph?.entities.find((one) => one.id === selectedId);
    return entity === undefined ? null : entityNode(entity);
  }, [graph, liveSeed, selectedId]);

  const decide = (id: string, state: CurationState) =>
    onCurate(curate(curation, id, state));

  // Decisions about entities this case does not hold are dropped once, when
  // the graph is known: switching case would otherwise leave the previous
  // one's judgements attached to ids that mean nothing here.
  useEffect(() => {
    if (graph === null) {
      return;
    }
    const pruned = prune(curation, graph);
    if (Object.keys(pruned).length !== Object.keys(curation).length) {
      onCurate(pruned);
    }
  }, [curation, graph, onCurate]);

  if (graph === null || placed === null) {
    return error === null ? (
      <BlankSlate note="reading the case…" />
    ) : (
      <p className="error console-view">{error}</p>
    );
  }

  const empty = graph.entities.length === 0;
  if (empty && liveSeed === null) {
    return (
      <div className="console-view">
        <SeedPrompt
          onSeed={(node) => {
            setSeed(node);
            onSelect(node.id);
          }}
        />
      </div>
    );
  }

  const omitted = placed.omitted > 0 ? ` · ${placed.omitted} omitted` : "";
  const legend = summary.byKind.map((one) => ({
    cat: (slots.get(one.name) ?? 0) + 1,
    count: one.count,
    label: one.name,
  }));

  return (
    <Workspace
      style={
        {
          "--vk-workspace-cols": "minmax(0, 1fr) 360px",
          height: "100%",
        } as Record<string, string>
      }
    >
      <PaneStack rows="minmax(0, 1.15fr) minmax(0, 1fr)">
        <Pane
          right={`${summary.total} entities · ${summary.relations} links${omitted}`}
          title="case · canvas"
        >
          {placed.omitted > 0 ? (
            <p className="error console-view">
              This is not the whole graph: {placed.omitted} entities are not
              shown.
            </p>
          ) : null}
          <Canvas>
            <GraphSurface
              camera={camera}
              label="case graph"
              layoutName={layoutName}
              onCamera={onCamera}
              onLayout={setChosenLayout}
              onSelect={(pick) => onSelect(pick === null ? null : pick.id)}
              selectedId={selectedId}
              view={canvasView}
            />
          </Canvas>
          {legend.length === 0 ? null : <Legend items={legend} />}
        </Pane>

        <Pane
          right={`${summary.kept} kept · ${summary.deferred} deferred · ${summary.discarded} discarded`}
          title="case · everything in it"
        >
          <CaseTable
            filter={filter}
            graph={graph}
            onCurate={decide}
            onFilter={setFilter}
            onSelect={onSelect}
            rows={rows}
            selectedId={selectedId}
            slots={slots}
            summary={summary}
          />
        </Pane>
      </PaneStack>

      <PaneStack rows="minmax(0, auto) minmax(0, 1fr)">
        <Pane title={selected === null ? "case · overview" : "node"}>
          {selected === null ? (
            <CaseOverview slots={slots} summary={summary} />
          ) : (
            <NodeFacts node={selected} />
          )}
        </Pane>
        <Pane
          right={
            selected === null
              ? `${summary.fresh} new since last run`
              : `${expansionCount(selected, contracts)} available`
          }
          title="expand"
        >
          {selected === null ? (
            <BlankSlate note="pick a node — on the canvas or in the table — to see what can be run from it" />
          ) : (
            <ExpandPane
              client={client}
              contracts={contracts}
              entries={entries}
              graph={graph}
              // Remounts when the node changes, so a half-run expansion never
              // carries over to the next node.
              key={selected.id}
              node={selected}
              onNewSeed={() => {
                setSeed(null);
                onSelect(null);
              }}
              onReload={reload}
            />
          )}
        </Pane>
      </PaneStack>
    </Workspace>
  );
};
