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

export interface StepRecord {
  readonly evidenceIds: readonly string[];
  readonly id: string;
  readonly operation: {
    readonly _tag: string;
    readonly canonicalId?: string;
    readonly entity?: { readonly id: string };
    readonly mergeId?: string;
    readonly relation?: {
      readonly sourceId: string;
      readonly targetId: string;
    };
  };
}

/** Every step whose operation names this entity, in log order. */
export const stepsFor = (
  steps: readonly StepRecord[],
  entityId: string
): readonly StepRecord[] =>
  steps.filter((step) => {
    const { operation } = step;
    if (operation.entity?.id === entityId) {
      return true;
    }
    if (
      operation.relation?.sourceId === entityId ||
      operation.relation?.targetId === entityId
    ) {
      return true;
    }
    return operation.canonicalId === entityId || operation.mergeId === entityId;
  });

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
    return "related it to another entity";
  }
  if (operation._tag === "ResolveEntity") {
    return operation.canonicalId === undefined
      ? "merged it with another entity"
      : `merged it into ${operation.canonicalId}`;
  }
  return operation._tag;
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
