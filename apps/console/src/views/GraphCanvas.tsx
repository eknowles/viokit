import { Legend } from "@viokit/ui";
import { useEffect, useMemo, useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";
import type {
  GraphRelation,
  GraphSnapshot,
  Layout,
  PlacedEdge,
  PlacedNode,
} from "../graph-layout.js";
import { atTime, extentRange, layout } from "../graph-layout.js";
import type { LayoutName } from "../graph-shape.js";
import { suggestLayout } from "../graph-shape.js";
import type { GraphPick, GraphView } from "../graph-view.js";
import { graphView } from "../graph-view.js";
import type { StoredCamera } from "../persistence.js";
import type { EvidenceRecord, StepRecord, Subject } from "../provenance.js";
import {
  decodeContent,
  describeAcquisition,
  describeOperation,
  describeOrigin,
  isPreviewable,
  stepsForSubject,
} from "../provenance.js";
import type { LegendEntry, ViewSpecs } from "../view-spec.js";
import {
  legendFor,
  presentationFor,
  slotsForKinds,
  titleFor,
} from "../view-spec.js";
import { GraphSurface } from "./GraphSurface.js";

/**
 * The graph pane (TDR-020): the replayed graph as nodes and edges, filtered to
 * a moment by the temporal extents the data already carries.
 *
 * Read-only, and deliberately explicit about what it is not showing — a view
 * that silently rendered a subset would read as the whole graph, which for an
 * investigation tool is the worst available failure.
 */

const SIZE = 600;

/*
 * No pack publishes a view spec yet (`04-web-ui` §4.2 describes the format).
 * The console is written to consume one and to be correct without one, so this
 * is empty rather than seeded with guesses about kinds packs have not shipped.
 */
const SPECS: ViewSpecs = {};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One evidence record, or null — a gap in the trail is shown as a gap. */
const readRecord = async (
  client: Client,
  id: string
): Promise<EvidenceRecord | null> => {
  try {
    return (await client.call("evidence_get", { id })) as EvidenceRecord;
  } catch {
    return null;
  }
};

/**
 * The time rail and what it is currently showing.
 *
 * Its own component because the pane had grown past what reads in one piece,
 * and because "how much of the graph is on screen" is a claim the view makes
 * and should be able to make in one place.
 */
const TimeControls = ({
  entities,
  omitted,
  onTime,
  range,
  shown,
  time,
}: {
  readonly entities: number;
  readonly omitted: number;
  readonly onTime: (at: number | null) => void;
  readonly range: { readonly from: number; readonly to: number } | null;
  readonly shown: number;
  readonly time: number | null;
}) => (
  <div className="graph-controls">
    {range === null ? null : (
      <label htmlFor="graph-time">
        <span className="label">
          at {time === null ? "any time" : iso(time)}
        </span>
        <input
          id="graph-time"
          max={range.to}
          min={range.from}
          onChange={(e) => onTime(Number(e.target.value))}
          type="range"
          value={time ?? range.to}
        />
      </label>
    )}
    <button onClick={() => onTime(null)} type="button">
      show all time
    </button>
    <span className="hint">
      {shown} of {entities} entities
      {omitted > 0
        ? ` — showing a subset, ${omitted} omitted by the render limit`
        : ""}
    </span>
  </div>
);

/** What the canvas selected, as a subject the rest of the console addresses. */
const toSubject = (pick: GraphPick | null): Subject | null => {
  if (pick === null) {
    return null;
  }
  if (pick.type === "edge") {
    return { id: pick.id, kind: "relation" };
  }
  return { id: pick.id, kind: pick.nodeKind === "event" ? "event" : "entity" };
};

/** The investigator's choice if they made one, otherwise the graph's shape. */
const chooseLayout = (
  chosen: LayoutName | null,
  graph: GraphSnapshot | null,
  time: number | null
): LayoutName => {
  if (chosen !== null) {
    return chosen;
  }
  return graph === null ? "preset" : suggestLayout(atTime(graph, time));
};

/**
 * How the pane draws what it has: nodes coloured by kind, and a legend that
 * decodes the colouring.
 *
 * Outside the component because it is a pure function of the layout, and
 * because the pane had already grown past what reads comfortably in one place.
 */
const panePresentation = (
  placed: Layout | null
): { readonly legend: readonly LegendEntry[]; readonly view: GraphView } => {
  if (placed === null) {
    return { legend: [], view: { edges: [], nodes: [] } };
  }
  const kinds = placed.nodes.map((node) => node.entity.kind);
  const slots = slotsForKinds(kinds);
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return {
    legend: legendFor(kinds, SPECS, slots, counts),
    view: graphView(placed, {
      decorateNode: (node) => ({
        classes: presentationFor(node.entity.kind, SPECS, slots).classes,
        title: titleFor(
          { kind: node.entity.kind, label: node.entity.id },
          SPECS
        ),
      }),
    }),
  };
};

const Provenance = ({
  client,
  subject,
}: {
  readonly client: Client;
  readonly subject: Subject;
}) => {
  const [steps, setSteps] = useState<readonly StepRecord[] | null>(null);
  const [evidence, setEvidence] = useState<Record<string, EvidenceRecord>>({});
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    client
      .call("log")
      .then(async (result) => {
        const found = stepsForSubject(result as StepRecord[], subject);
        if (cancelled) {
          return;
        }
        setSteps(found);
        const ids = [...new Set(found.flatMap((step) => step.evidenceIds))];
        const records = await Promise.all(
          ids.map((id) => readRecord(client, id))
        );
        if (!cancelled) {
          const byId: Record<string, EvidenceRecord> = {};
          for (const record of records) {
            if (record !== null) {
              const evidenceRecord = record as EvidenceRecord;
              byId[evidenceRecord.id] = evidenceRecord;
            }
          }
          setEvidence(byId);
        }
      })
      .catch(() => setSteps([]));
    return () => {
      cancelled = true;
    };
  }, [client, subject]);

  const show = (id: string) => {
    client
      .call("evidence_get", { id, includeContent: true })
      .then((record) => {
        const withContent = record as EvidenceRecord;
        setPreview({
          id,
          text: decodeContent(withContent.content ?? ""),
        });
      })
      .catch(() => setPreview({ id, text: "" }));
  };

  if (steps === null) {
    return <p className="hint">Reading the trail…</p>;
  }
  if (steps.length === 0) {
    return (
      <p className="hint">
        No steps in the log assert this {subject.kind} — its provenance cannot
        be shown.
      </p>
    );
  }

  return (
    <div>
      <h3>How this got here</h3>
      {steps.map((step) => (
        <div className="trail-step" key={step.id}>
          <div>{describeOperation(step)}</div>
          {describeOrigin(step) === null ? null : (
            <div className="hint">by {describeOrigin(step)}</div>
          )}
          {step.evidenceIds.map((id) => {
            const record = evidence[id];
            return (
              <div className="trail-evidence" key={id}>
                <code>{id}</code>
                {record === undefined ? (
                  <span className="hint"> — evidence not found</span>
                ) : (
                  <>
                    <span className="hint">
                      {" "}
                      — {describeAcquisition(record.acquisitionPath)},{" "}
                      {record.contentType}, {record.byteLength} bytes
                    </span>
                    {isPreviewable(record.contentType) ? (
                      <button onClick={() => show(id)} type="button">
                        view artifact
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {preview === null ? null : (
        // Inserted as text, never as markup: a captured page must not execute
        // in the console.
        <pre>{preview.text || "(no content)"}</pre>
      )}
    </div>
  );
};

const RelationDetail = ({
  edge,
  relation,
}: {
  readonly edge: PlacedEdge;
  readonly relation: GraphRelation;
}) => (
  <div className="detail">
    <h3>{relation.type}</h3>
    <table>
      <tbody>
        <tr>
          <td>from</td>
          <td>{edge.source.entity.id}</td>
        </tr>
        <tr>
          <td>to</td>
          <td>{edge.target.entity.id}</td>
        </tr>
        <tr>
          <td>valid</td>
          <td>
            {relation.temporalExtent.validFrom} →{" "}
            {relation.temporalExtent.validTo}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);

const NodeDetail = ({ node }: { readonly node: PlacedNode }) => (
  <div className="detail">
    <h3>
      {node.entity.id}
      {node.kind === "event" ? <span className="hint"> (event)</span> : null}
    </h3>
    <table>
      <tbody>
        <tr>
          <td>kind</td>
          <td>{node.entity.kind}</td>
        </tr>
        <tr>
          <td>valid</td>
          <td>
            {node.entity.temporalExtent.validFrom} →{" "}
            {node.entity.temporalExtent.validTo}
          </td>
        </tr>
        {node.event === undefined ? null : (
          <tr>
            <td>involves</td>
            <td>{node.event.entityIds.join(", ")}</td>
          </tr>
        )}
        {(node.entity.identifiers ?? []).map((identifier) => (
          <tr key={`${identifier.kind}:${identifier.value}`}>
            <td>{identifier.kind}</td>
            <td>{identifier.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const GraphCanvasView = ({
  camera,
  client,
  onCamera,
  onSelect,
  onTime,
  selected,
  time,
}: {
  readonly camera: StoredCamera | null;
  readonly client: Client;
  readonly onCamera: (camera: StoredCamera) => void;
  readonly onSelect: (subject: Subject | null) => void;
  readonly onTime: (at: number | null) => void;
  readonly selected: Subject | null;
  readonly time: number | null;
}) => {
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenLayout, setChosenLayout] = useState<LayoutName | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .call("replay")
      .then((state) => {
        if (!cancelled) {
          setGraph(state as GraphSnapshot);
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
  }, [client]);

  const range = useMemo(
    () => (graph === null ? null : extentRange(graph)),
    [graph]
  );

  const placed = useMemo(
    () => (graph === null ? null : layout(atTime(graph, time), { size: SIZE })),
    [graph, time]
  );

  // Suggested from what is actually on screen — the time-filtered graph, not
  // the whole one, since that is what is being laid out.
  const layoutName = useMemo(
    () => chooseLayout(chosenLayout, graph, time),
    [chosenLayout, graph, time]
  );

  const { legend, view: paneView } = useMemo(
    () => panePresentation(placed),
    [placed]
  );

  if (error !== null) {
    return <p className="error">{error}</p>;
  }
  if (graph === null || placed === null) {
    return <p className="hint">Loading…</p>;
  }
  if (graph.entities.length === 0) {
    return (
      <p className="hint">
        The graph is empty — run a transform and commit its steps.
      </p>
    );
  }

  const selectedNode =
    selected?.kind === "relation"
      ? null
      : (placed.nodes.find((node) => node.entity.id === selected?.id) ?? null);
  const selectedEdge =
    selected?.kind === "relation"
      ? (placed.edges.find((edge) => edge.id === selected.id) ?? null)
      : null;

  return (
    <div>
      <TimeControls
        entities={graph.entities.length}
        omitted={placed.omitted}
        onTime={onTime}
        range={range}
        shown={placed.nodes.length}
        time={time}
      />

      {placed.omitted > 0 ? (
        <p className="error">
          This is not the whole graph: {placed.omitted} entities are not shown.
          Narrow the investigation or query a subgraph.
        </p>
      ) : null}

      {placed.nodes.length === 0 ? (
        <p className="hint">Nothing was valid at this time.</p>
      ) : (
        <GraphSurface
          camera={camera}
          label="investigation graph"
          layoutName={layoutName}
          onCamera={onCamera}
          onLayout={setChosenLayout}
          onSelect={(pick) => onSelect(toSubject(pick))}
          selectedId={selected === null ? null : selected.id}
          view={paneView}
        />
      )}
      {legend.length === 0 ? null : <Legend items={legend} />}

      {selected === null ? null : (
        <div>
          <button onClick={() => onSelect(null)} type="button">
            clear selection
          </button>
          {selectedNode === null ? null : <NodeDetail node={selectedNode} />}
          {selectedEdge?.relation === undefined ? null : (
            <RelationDetail
              edge={selectedEdge}
              relation={selectedEdge.relation}
            />
          )}
          <Provenance client={client} subject={selected} />
        </div>
      )}
    </div>
  );
};
