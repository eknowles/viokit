import { useEffect, useMemo, useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";
import type {
  GraphRelation,
  GraphSnapshot,
  PlacedEdge,
  PlacedNode,
} from "../graph-layout.js";
import { atTime, extentRange, layout } from "../graph-layout.js";
import type { EvidenceRecord, StepRecord, Subject } from "../provenance.js";
import {
  decodeContent,
  describeAcquisition,
  describeOperation,
  describeOrigin,
  isPreviewable,
  stepsForSubject,
} from "../provenance.js";

/**
 * The graph pane (TDR-020): the replayed graph as nodes and edges, filtered to
 * a moment by the temporal extents the data already carries.
 *
 * Read-only, and deliberately explicit about what it is not showing — a view
 * that silently rendered a subset would read as the whole graph, which for an
 * investigation tool is the worst available failure.
 */

const SIZE = 600;
const NODE_RADIUS = 7;

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
  client,
  onSelect,
  onTime,
  selected,
  time,
}: {
  readonly client: Client;
  readonly onSelect: (subject: Subject | null) => void;
  readonly onTime: (at: number | null) => void;
  readonly selected: Subject | null;
  readonly time: number | null;
}) => {
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          {placed.nodes.length} of {graph.entities.length} entities
          {placed.omitted > 0
            ? ` — showing a subset, ${placed.omitted} omitted by the render limit`
            : ""}
        </span>
      </div>

      {placed.omitted > 0 ? (
        <p className="error">
          This is not the whole graph: {placed.omitted} entities are not shown.
          Narrow the investigation or query a subgraph.
        </p>
      ) : null}

      {placed.nodes.length === 0 ? (
        <p className="hint">Nothing was valid at this time.</p>
      ) : (
        <svg
          aria-label="investigation graph"
          height={SIZE}
          role="img"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
        >
          <title>Investigation graph</title>
          {placed.edges.map((edge) => {
            const selectable = edge.relation !== undefined;
            const chosen = selected?.id === edge.id;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: role and tabIndex are set below; SVG has no button element
              <line
                aria-label={edge.relation?.type ?? "connection"}
                className={chosen ? "edge selected" : "edge"}
                key={edge.id}
                onClick={
                  selectable
                    ? () =>
                        onSelect(
                          chosen ? null : { id: edge.id, kind: "relation" }
                        )
                    : undefined
                }
                onKeyDown={
                  selectable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(
                            chosen ? null : { id: edge.id, kind: "relation" }
                          );
                        }
                      }
                    : undefined
                }
                role={selectable ? "button" : undefined}
                tabIndex={selectable ? 0 : undefined}
                x1={edge.source.x}
                x2={edge.target.x}
                y1={edge.source.y}
                y2={edge.target.y}
              />
            );
          })}
          {placed.nodes.map((node) => {
            const chosen = node.entity.id === selected?.id;
            const toggle = () =>
              onSelect(chosen ? null : { id: node.entity.id, kind: node.kind });
            return (
              // Keyboard-reachable: a node is a control, so it behaves like
              // one. `<button>` is not valid SVG content, so the role is
              // carried explicitly rather than by element.
              // biome-ignore lint/a11y/useSemanticElements: no button element in SVG
              <g
                aria-label={`${node.entity.kind} ${node.entity.id}`}
                aria-pressed={chosen}
                className={`node ${node.kind}${chosen ? "selected" : ""}`}
                key={node.entity.id}
                onClick={toggle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle();
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <circle cx={node.x} cy={node.y} r={NODE_RADIUS} />
                <text x={node.x + NODE_RADIUS + 4} y={node.y + 4}>
                  {node.entity.id}
                </text>
              </g>
            );
          })}
        </svg>
      )}

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
