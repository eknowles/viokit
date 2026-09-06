import {
  BlankSlate,
  Button,
  cx,
  FieldList,
  Picker,
  PickerItem,
  Toolbar,
} from "@viokit/ui";
import { useState } from "react";
import type { CaseNode, Expansion, TransformContract } from "../case.js";
import { expansionsFor, newEntities } from "../case.js";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";
import type { GraphSnapshot } from "../graph-layout.js";
import { SchemaForm } from "../SchemaForm.js";

/**
 * What can be run from the selected node, and the deliberate act of putting
 * the result in the graph.
 *
 * Running and committing are separate on purpose: `run_transform` stages
 * evidence-attributed steps, and an investigator decides whether the
 * derivation is sound before it enters the graph. Auto-committing would make
 * the canvas faster and the provenance worthless.
 */

export interface CatalogEntry {
  readonly description?: string;
  readonly id: string;
  readonly kind: string;
  readonly reason?: string;
  readonly runnable?: boolean;
}

export interface Step {
  readonly evidenceIds: readonly string[];
  readonly id: string;
  readonly operation: { readonly _tag: string };
}

const messageOf = (cause: unknown): string =>
  cause instanceof OperationFailure ? cause.message : String(cause);

export const NodeFacts = ({ node }: { readonly node: CaseNode }) => (
  <FieldList
    fields={[
      ["value", node.label],
      ["kind", node.kind],
      [
        "origin",
        node.origin === "seed" ? "seed · not yet evidenced" : "in the graph",
      ],
      ...node.identifiers.map(
        (identifier) =>
          [identifier.kind, identifier.value] as readonly [string, string]
      ),
    ]}
  />
);

const ExpansionList = ({
  entries,
  expansions,
  onPick,
  picked,
}: {
  readonly entries: ReadonlyMap<string, CatalogEntry>;
  readonly expansions: readonly Expansion[];
  readonly onPick: (expansion: Expansion) => void;
  readonly picked: string | null;
}) => {
  if (expansions.length === 0) {
    return (
      <BlankSlate note="no published transform takes a value this node can fill — give the seed a kind, or run one from the launcher" />
    );
  }
  return (
    <Picker>
      {expansions.map((expansion) => {
        const entry = entries.get(expansion.transformId);
        const blocked = entry?.runnable === false;
        return (
          <PickerItem
            disabled={blocked}
            key={expansion.transformId}
            on={picked === expansion.transformId}
            onClick={() => onPick(expansion)}
          >
            <span className="expansion">
              <span className="expansion-id">{expansion.transformId}</span>
              <span className="hint">
                {blocked
                  ? `blocked here — ${entry?.reason ?? "cannot run"}`
                  : expansion.reason}
              </span>
            </span>
            <span className="vk-spacer" />
            <span
              className={cx(
                "vk-micro",
                expansion.fit === "exact" ? "vk-ok" : "vk-dim"
              )}
            >
              {expansion.fit === "exact" ? "fits" : "check"}
            </span>
          </PickerItem>
        );
      })}
    </Picker>
  );
};

const Staged = ({
  onCommit,
  pending,
  steps,
}: {
  readonly onCommit: () => void;
  readonly pending: boolean;
  readonly steps: readonly Step[];
}) => (
  <div className="console-view">
    <h3>
      Staged — {steps.length} step{steps.length === 1 ? "" : "s"}, not yet in
      the graph
    </h3>
    <ul className="staged">
      {steps.map((step) => (
        <li key={step.id}>
          <span className="vk-mono">{step.operation._tag}</span>
          <span className="hint">{step.evidenceIds.length} evidence</span>
        </li>
      ))}
    </ul>
    <Button disabled={pending} onClick={onCommit} tone="ink">
      {pending ? "Adding…" : "Add to graph"}
    </Button>
  </div>
);

/** What committing actually achieved, counted rather than assumed. */
const describeGain = (count: number): string =>
  count === 0
    ? "committed — every entity returned was already in the graph"
    : `committed — ${count} new ${count === 1 ? "entity" : "entities"}`;

export const ExpandPane = ({
  client,
  contracts,
  entries,
  graph,
  node,
  onNewSeed,
  onReload,
}: {
  readonly client: Client;
  readonly contracts: readonly TransformContract[];
  readonly entries: ReadonlyMap<string, CatalogEntry>;
  readonly graph: GraphSnapshot;
  readonly node: CaseNode;
  readonly onNewSeed: () => void;
  /** Re-reads the graph and hands back the fresh snapshot. */
  readonly onReload: () => Promise<GraphSnapshot>;
}) => {
  const [picked, setPicked] = useState<Expansion | null>(null);
  const [staged, setStaged] = useState<readonly Step[] | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const expansions = expansionsFor(node, contracts);
  const shape =
    contracts.find((one) => one.id === picked?.transformId)?.shape ?? null;

  const run = (args: Record<string, unknown>) => {
    if (picked === null) {
      return;
    }
    setPending(true);
    setError(null);
    setStaged(null);
    setOutcome(null);
    client
      .call("run_transform", { input: args, transformId: picked.transformId })
      .then((result) => setStaged(result as readonly Step[]))
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(false));
  };

  const commit = () => {
    if (staged === null) {
      return;
    }
    const before = graph;
    setPending(true);
    setError(null);
    Promise.all(staged.map((step) => client.call("insert", { step })))
      .then(() => onReload())
      .then((after) => {
        setStaged(null);
        setPicked(null);
        setOutcome(describeGain(newEntities(before, after).length));
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setPending(false));
  };

  return (
    <>
      <Toolbar right={node.label}>
        <Button onClick={onNewSeed} tone="quiet">
          new seed
        </Button>
      </Toolbar>
      <ExpansionList
        entries={entries}
        expansions={expansions}
        onPick={(expansion) => {
          setPicked(expansion);
          setStaged(null);
          setOutcome(null);
        }}
        picked={picked?.transformId ?? null}
      />
      {picked !== null && shape !== null ? (
        <div className="console-view">
          <h3>{picked.transformId}</h3>
          <SchemaForm
            initial={picked.fill}
            onSubmit={run}
            pending={pending}
            shape={shape}
            transformId={picked.transformId}
          />
        </div>
      ) : null}
      {error === null ? null : <p className="error console-view">{error}</p>}
      {outcome === null ? null : <p className="ok console-view">{outcome}</p>}
      {staged === null ? null : (
        <Staged onCommit={commit} pending={pending} steps={staged} />
      )}
    </>
  );
};

/** How many transforms this node offers — for the pane header. */
export const expansionCount = (
  node: CaseNode,
  contracts: readonly TransformContract[]
): number => expansionsFor(node, contracts).length;
