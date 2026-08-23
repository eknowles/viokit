/**
 * Deriving an entity's provenance from the step log.
 *
 * Read from the log rather than from an index: the log is the system of record
 * (I3), and an index could disagree with it. A trail that disagrees with the
 * record would be worse than a slow one.
 */

export interface AcquisitionPath {
  readonly _tag: string;
  readonly by?: string;
  readonly ref?: string;
}

export interface EvidenceRecord {
  readonly acquiredAt: string;
  readonly acquisitionPath: AcquisitionPath;
  readonly byteLength: number;
  readonly content?: string;
  readonly contentType: string;
  readonly id: string;
}

/** What a selection is about. Every kind of assertion the graph holds can be
 * inspected, not only entities. */
export type SubjectKind = "entity" | "relation" | "event";

export interface Subject {
  readonly id: string;
  readonly kind: SubjectKind;
}

export interface StepRecord {
  readonly event?: { readonly id: string };
  readonly evidenceIds: readonly string[];
  readonly id: string;
  readonly operation: {
    readonly _tag: string;
    readonly canonicalId?: string;
    readonly entity?: { readonly id: string };
    readonly event?: {
      readonly entityIds?: readonly string[];
      readonly id: string;
    };
    readonly mergeId?: string;
    readonly relation?: {
      readonly id: string;
      readonly sourceId: string;
      readonly targetId: string;
    };
  };
  readonly sourceId?: string;
  readonly sourceVersion?: string;
  readonly transformId?: string;
}

/**
 * Every step whose operation asserts this subject, in log order.
 *
 * Matching is by subject identity, so selecting a relation finds the steps that
 * asserted *that relation* — not every step that happens to mention one of its
 * endpoints, which would present a neighbour's provenance as the relation's own.
 */
export const stepsForSubject = (
  steps: readonly StepRecord[],
  subject: Subject
): readonly StepRecord[] =>
  steps.filter((step) => {
    const { operation } = step;
    if (subject.kind === "relation") {
      return operation.relation?.id === subject.id;
    }
    if (subject.kind === "event") {
      return operation.event?.id === subject.id;
    }
    if (operation.entity?.id === subject.id) {
      return true;
    }
    if (
      operation.relation?.sourceId === subject.id ||
      operation.relation?.targetId === subject.id
    ) {
      return true;
    }
    if (operation.event?.entityIds?.includes(subject.id) === true) {
      return true;
    }
    return (
      operation.canonicalId === subject.id || operation.mergeId === subject.id
    );
  });

/** Every step naming this entity. Kept for entity-only callers. */
export const stepsFor = (
  steps: readonly StepRecord[],
  entityId: string
): readonly StepRecord[] =>
  stepsForSubject(steps, { id: entityId, kind: "entity" });

/**
 * How an artifact was obtained, in words. This is the single most useful thing
 * an investigator can know about a piece of evidence — the difference between
 * "we fetched this" and "someone typed this in".
 */
export const describeAcquisition = (path: AcquisitionPath): string => {
  if (path._tag === "manual") {
    const by = path.by === undefined ? "a person" : path.by;
    return path.ref === undefined
      ? `retrieved by hand, by ${by}`
      : `retrieved by hand, by ${by}, from ${path.ref}`;
  }
  if (path._tag === "cache") {
    return "served from cache";
  }
  if (path._tag === "proxy") {
    return "fetched through a proxy";
  }
  if (path._tag === "live") {
    return "fetched live";
  }
  return path._tag;
};

/** What a step did, in words, without assuming a domain vocabulary. */
export const describeOperation = (step: StepRecord): string => {
  const { operation } = step;
  if (operation._tag === "AddEntity") {
    return "added this entity";
  }
  if (operation._tag === "AddRelation") {
    return operation.relation === undefined
      ? "related it to another entity"
      : `asserted ${operation.relation.sourceId} → ${operation.relation.targetId}`;
  }
  if (operation._tag === "AddEvent") {
    return "recorded an event involving it";
  }
  if (operation._tag === "ResolveEntity") {
    return operation.canonicalId === undefined
      ? "merged it with another entity"
      : `merged it into ${operation.canonicalId}`;
  }
  return operation._tag;
};

/**
 * What ran, where a step records it (I7). A step derived from existing graph
 * state records nothing, and none is invented for it — an absent provenance is
 * better than a plausible one.
 */
export const describeOrigin = (step: StepRecord): string | null => {
  if (step.transformId === undefined && step.sourceId === undefined) {
    return null;
  }
  const transform = step.transformId ?? "an unnamed transform";
  if (step.sourceId === undefined) {
    return transform;
  }
  const version =
    step.sourceVersion === undefined || step.sourceVersion === "unversioned"
      ? "unversioned"
      : `version ${step.sourceVersion}`;
  return `${transform}, from ${step.sourceId} (${version})`;
};

/** Textual artifacts can be previewed; anything else is described, not rendered. */
export const isPreviewable = (contentType: string): boolean =>
  contentType.startsWith("text/") ||
  contentType === "application/json" ||
  contentType === "application/xml";

export const decodeContent = (base64: string): string => {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    );
  } catch {
    return "";
  }
};
