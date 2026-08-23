import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import { useCallback, useSyncExternalStore } from "react";

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

export type ViewName = "catalog" | "launcher" | "evidence" | "graph";

export const viewAtom = Atom.make<ViewName>("catalog");
export const selectedTransformAtom = Atom.make<string | null>(null);
export const runnableOnlyAtom = Atom.make(false);
