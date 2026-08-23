import { useEffect, useMemo, useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";
import type { GraphSnapshot, PlacedNode } from "../graph-layout.js";
import { atTime, extentRange, layout } from "../graph-layout.js";

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

const NodeDetail = ({ node }: { readonly node: PlacedNode }) => (
  <div className="detail">
    <h3>{node.entity.id}</h3>
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
  readonly onSelect: (id: string | null) => void;
  readonly onTime: (at: number | null) => void;
  readonly selected: string | null;
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
    placed.nodes.find((node) => node.entity.id === selected) ?? null;

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
          {placed.edges.map((edge) => (
            <line
              className="edge"
              key={edge.relation.id}
              x1={edge.source.x}
              x2={edge.target.x}
              y1={edge.source.y}
              y2={edge.target.y}
            />
          ))}
          {placed.nodes.map((node) => {
            const toggle = () =>
              onSelect(node.entity.id === selected ? null : node.entity.id);
            return (
              // Keyboard-reachable: a node is a control, so it behaves like
              // one. `<button>` is not valid SVG content, so the role is
              // carried explicitly rather than by element.
              // biome-ignore lint/a11y/useSemanticElements: no button element in SVG
              <g
                aria-label={`${node.entity.kind} ${node.entity.id}`}
                aria-pressed={node.entity.id === selected}
                className={
                  node.entity.id === selected ? "node selected" : "node"
                }
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

      {selectedNode === null ? null : (
        <div>
          <button onClick={() => onSelect(null)} type="button">
            clear selection
          </button>
          <NodeDetail node={selectedNode} />
        </div>
      )}
    </div>
  );
};
