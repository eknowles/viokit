import type { Client } from "./client.js";

/**
 * View-state persistence (TDR-012, I12). The console's configuration is
 * schema-encoded, versioned, and stored server-side through the same operation
 * table as everything else — not in the browser, which the invariant forbids.
 *
 * Failing to save must never interrupt an investigation, so saves are
 * fire-and-forget; failing to *load* yields defaults, because unusable
 * configuration must not make the console unusable.
 */

export const SURFACE = "console";

/** Bump when the payload's shape changes; older documents then read as absent. */
export const VERSION = 1;

export interface ConsoleViewState {
  readonly runnableOnly: boolean;
  readonly selectedTransform: string | null;
  readonly view: string;
}

export const defaultViewState: ConsoleViewState = {
  runnableOnly: false,
  selectedTransform: null,
  view: "catalog",
};

const isViewState = (value: unknown): value is ConsoleViewState => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.view === "string" &&
    typeof candidate.runnableOnly === "boolean" &&
    (candidate.selectedTransform === null ||
      typeof candidate.selectedTransform === "string")
  );
};

/**
 * The store validates the envelope; the surface validates its own payload —
 * so a payload written by a different console still degrades to defaults
 * rather than being half-applied.
 */
export const loadViewState = async (
  client: Client
): Promise<ConsoleViewState> => {
  try {
    const result = (await client.call("view_state_load", {
      surface: SURFACE,
      version: VERSION,
    })) as { value?: { payload?: unknown } } | null;
    const payload = result?.value?.payload;
    return isViewState(payload) ? payload : defaultViewState;
  } catch {
    return defaultViewState;
  }
};

export const saveViewState = (
  client: Client,
  state: ConsoleViewState
): void => {
  client
    .call("view_state_save", {
      payload: state,
      surface: SURFACE,
      version: VERSION,
    })
    .catch(() => {
      // Losing a layout preference must not interrupt an investigation.
    });
};

/** Coalesce bursts of changes; a filesystem store does not want a write per keystroke. */
export const debounce = <A>(
  fn: (value: A) => void,
  ms: number
): ((value: A) => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (value: A) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(value), ms);
  };
};
