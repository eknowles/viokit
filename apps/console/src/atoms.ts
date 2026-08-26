import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { useCallback, useSyncExternalStore } from "react";
import type { Curation } from "./case-table.js";
import type { StoredCamera } from "./persistence.js";
import type { Subject } from "./provenance.js";

/**
 * Client state (TDR-002). Atoms come from `effect/unstable/reactivity`, which
 * ships inside the `effect` we already pin — so the state layer cannot drift
 * from the schemas it carries. The React binding is this file: small enough to
 * discard if a first-party one lands.
 *
 * State is persisted server-side through the operation table (TDR-012), never
 * in the browser: I12 requires view state to be schema-encoded, versioned, per
 * (user, investigation), and server-backed. See `persistence.ts`.
 */

export const registry = AtomRegistry.make();

export const useAtomValue = <A>(atom: Atom.Atom<A>): A => {
  const subscribe = useCallback(
    (onChange: () => void) => registry.subscribe(atom, onChange),
    [atom]
  );
  return useSyncExternalStore(
    subscribe,
    () => registry.get(atom),
    () => registry.get(atom)
  );
};

export const useAtom = <A>(
  atom: Atom.Writable<A, A>
): readonly [A, (value: A) => void] => {
  const value = useAtomValue(atom);
  const set = useCallback((next: A) => registry.set(atom, next), [atom]);
  return [value, set] as const;
};

export type ViewName =
  | "case"
  | "catalog"
  | "launcher"
  | "evidence"
  | "graph"
  | "canvas";

export const viewAtom = Atom.make<ViewName>("case");
export const selectedTransformAtom = Atom.make<string | null>(null);
export const runnableOnlyAtom = Atom.make(false);
/** The graph's current selection — an entity, relation, or event. */
export const graphSelectionAtom = Atom.make<Subject | null>(null);
/** The case canvas's selected node. Separate from `graphSelectionAtom`: that
 * one addresses any subject in the replayed log, this one addresses a node on
 * the canvas, which may be a seed that is not in the log at all. */
export const caseSelectionAtom = Atom.make<string | null>(null);
/** Keep/defer/discard decisions, by entity id. A judgement about what is worth
 * following, not a fact about the world — so it lives in view state, and
 * discarding hides a row rather than unsaying an evidence-attributed step. */
export const curationAtom = Atom.make<Curation>({});
export const graphTimeAtom = Atom.make<number | null>(null);
/** Where the investigator was looking. Null means never framed: the graph opens
 * fitted rather than at an arbitrary origin. Scoped per investigation by the
 * view-state store, so switching case changes what you see *and* where from. */
export const cameraAtom = Atom.make<StoredCamera | null>(null);
