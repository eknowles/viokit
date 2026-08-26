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
export const VERSION = 6;

/** Where the investigator was looking. Re-finding your place in a graph is
 * most of the cost of leaving it, so the camera is worth storing. */
export interface StoredCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ConsoleViewState {
  /** Absent means: never framed this case — open fitted rather than at an
   * arbitrary origin. */
  readonly camera: StoredCamera | null;
  readonly caseSelection: string | null;
  readonly curation: Curation;
  readonly graphSelection: Subject | null;
  readonly graphTime: number | null;
  readonly runnableOnly: boolean;
  readonly selectedTransform: string | null;
  readonly view: string;
}

export const defaultViewState: ConsoleViewState = {
  camera: null,
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

/** A camera, or nothing. A partial one would frame the graph somewhere
 * meaningless, which is worse than framing it afresh. */
const isCamera = (value: unknown): value is StoredCamera => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    typeof candidate.zoom === "number" &&
    Number.isFinite(candidate.zoom) &&
    candidate.zoom > 0
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
    (candidate.graphTime === null || typeof candidate.graphTime === "number") &&
    (candidate.camera === null || isCamera(candidate.camera))
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
