import type { Curation, CurationState } from "./case-table.js";
import type { Client } from "./client.js";
import type { Subject } from "./provenance.js";

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
export const VERSION = 5;

export interface ConsoleViewState {
  readonly caseSelection: string | null;
  readonly curation: Curation;
  readonly graphSelection: Subject | null;
  readonly graphTime: number | null;
  readonly runnableOnly: boolean;
  readonly selectedTransform: string | null;
  readonly view: string;
}

export const defaultViewState: ConsoleViewState = {
  caseSelection: null,
  curation: {},
  graphSelection: null,
  graphTime: null,
  runnableOnly: false,
  selectedTransform: null,
  view: "case",
};

const SUBJECT_KINDS = new Set(["entity", "relation", "event"]);
const CURATION_STATES = new Set<string>([
  "deferred",
  "discarded",
  "kept",
  "new",
]);

/** A record of entity id → decision, and nothing else. */
const isCuration = (value: unknown): value is Curation => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(
    (state): state is CurationState =>
      typeof state === "string" && CURATION_STATES.has(state)
  );
};

const isSubject = (value: unknown): value is Subject => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.kind === "string" &&
    SUBJECT_KINDS.has(candidate.kind)
  );
};

const isViewState = (value: unknown): value is ConsoleViewState => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.view === "string" &&
    (candidate.caseSelection === null ||
      typeof candidate.caseSelection === "string") &&
    isCuration(candidate.curation) &&
    typeof candidate.runnableOnly === "boolean" &&
    (candidate.selectedTransform === null ||
      typeof candidate.selectedTransform === "string") &&
    (candidate.graphSelection === null ||
      isSubject(candidate.graphSelection)) &&
    (candidate.graphTime === null || typeof candidate.graphTime === "number")
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
