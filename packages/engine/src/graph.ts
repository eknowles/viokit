import { randomUUID } from "node:crypto";
import {
  type Entity,
  type Event,
  type ExtentHit,
  type GraphPath,
  GraphState,
  type GraphStore,
  type Investigation,
  type InvestigationId,
  investigationId,
  ProvenanceError,
  type RelatedEntity,
  type Relation,
  SharedArtifact,
  type Step,
  UnknownInvestigation,
} from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";
/**
 * In-memory graph store. The step log is append-only (I3); graph state is a
 * fold over the log, so replay reproduces state deterministically. Every insert
 * requires a step referencing at least one evidence id (I2). The four query
 * surfaces (paths/timeline/spatial/relatedness) run over the folded state.
 */
export class GraphService extends Context.Service<GraphService, GraphStore>()(
  "GraphService",
  {
    make: Effect.sync(() => {
      // Every step records the investigation it was appended under, so the
      // in-memory store scopes exactly as the DuckDB one does (TDR-025).
      const steps: Array<{
        readonly at: number;
        readonly investigation: string;
        readonly step: Step;
      }> = [];
      const investigations = new Map<string, Investigation>();

      const start = (
        name: string,
        from?: { readonly parent: InvestigationId; readonly forkedAt: number }
      ): Investigation => {
        const investigation = {
          createdAt: new Date(),
          ...(from === undefined ? {} : { forkedAt: from.forkedAt }),
          id: investigationId(randomUUID()),
          name,
          ...(from === undefined ? {} : { parent: from.parent }),
          status: "open",
        } as Investigation;
        investigations.set(investigation.id, investigation);
        return investigation;
      };

      const root = start("default");
      let currentId: string = root.id;

      /** The steps an investigation can see: its own, plus each ancestor's up
       * to where the fork happened, with the bound tightening as it walks up. */
      const visible = (): readonly Step[] => {
        const windows: Array<{ readonly id: string; readonly upTo: number }> =
          [];
        let cursor: string | undefined = currentId;
        let bound = Number.POSITIVE_INFINITY;
        while (cursor !== undefined) {
          const investigation = investigations.get(cursor);
          if (investigation === undefined) {
            break;
          }
          windows.push({ id: cursor, upTo: bound });
          if (investigation.parent === undefined) {
            break;
          }
          bound = Math.min(bound, investigation.forkedAt ?? 0);
          cursor = investigation.parent;
        }
        return steps
          .filter((entry) =>
            windows.some(
              (window) =>
                window.id === entry.investigation && entry.at <= window.upTo
            )
          )
          .map((entry) => entry.step);
      };

      const fold = (): {
        readonly entities: Entity[];
        readonly relations: Relation[];
        readonly events: Event[];
      } => {
        const entities = new Map<string, Entity>();
        const relations = new Map<string, Relation>();
        const events = new Map<string, Event>();

        for (const step of visible()) {
          const { operation } = step;
          switch (operation._tag) {
            case "AddEntity": {
              const { entity } = operation;
              entities.set(entity.id, entity);
              break;
            }
            case "AddRelation": {
              const { relation } = operation;
              relations.set(relation.id, relation);
              break;
            }
            case "AddEvent": {
              const { event } = operation;
              events.set(event.id, event);
              break;
            }
            default: {
              break;
            }
          }
        }

        return {
          entities: Array.from(entities.values()),
          events: Array.from(events.values()),
          relations: Array.from(relations.values()),
        };
      };

      const toState = (f: ReturnType<typeof fold>): GraphState =>
        GraphState.make({
          entities: f.entities,
          events: f.events,
          relations: f.relations,
        });

      const extents = (): ExtentHit[] => [
        ...fold().entities.map((entity) => ({
          id: entity.id,
          kind: entity.kind,
          lat: entity.spatialExtent.lat,
          lon: entity.spatialExtent.lon,
          validFrom: entity.temporalExtent.validFrom,
          validTo: entity.temporalExtent.validTo,
        })),
        ...fold().events.map((event) => ({
          id: event.id,
          kind: event.kind,
          lat: event.spatialExtent.lat,
          lon: event.spatialExtent.lon,
          validFrom: event.temporalExtent.validFrom,
          validTo: event.temporalExtent.validTo,
        })),
      ];

      const known = (
        id: InvestigationId
      ): Effect.Effect<Investigation, UnknownInvestigation> => {
        const found = investigations.get(id);
        return found === undefined
          ? UnknownInvestigation.make({
              message: `no investigation with id '${id}'`,
            })
          : Effect.succeed(found);
      };

      const store: GraphStore = {
        createInvestigation: (name) => Effect.sync(() => start(name)),
        current: Effect.sync(
          () => investigations.get(currentId) as Investigation
        ),
        discardInvestigation: (id) =>
          Effect.gen(function* () {
            const investigation = yield* known(id);
            if (id === currentId) {
              return yield* UnknownInvestigation.make({
                message: `investigation '${investigation.name}' is open; open another before discarding it`,
              });
            }
            // Append-only: the steps stay, the case stops contributing (I3).
            investigations.set(id, { ...investigation, status: "discarded" });
          }),
        dispose: Effect.void,
        forkInvestigation: (from, name) =>
          Effect.gen(function* () {
            yield* known(from);
            return start(name, { forkedAt: steps.length, parent: from });
          }),
        insert: (step) =>
          Effect.gen(function* () {
            if (step.evidenceIds.length === 0) {
              return yield* ProvenanceError.make({
                message: "step must reference at least one evidence id",
              });
            }
            steps.push({
              at: steps.length + 1,
              investigation: currentId,
              step,
            });
            return step;
          }),
        investigations: Effect.sync(() => [...investigations.values()]),
        log: Effect.sync(() => Array.from(visible())),
        openInvestigation: (id) =>
          Effect.gen(function* () {
            const investigation = yield* known(id);
            currentId = id;
            return investigation;
          }),
        paths: (from, to, maxDepth = 4) =>
          Effect.sync(() => {
            const { relations } = fold();
            const out: GraphPath[] = [];
            const visited = new Set<string>();
            const neighbors = (current: string): Relation[] =>
              relations.filter(
                (relation) =>
                  relation.sourceId === current &&
                  !visited.has(relation.targetId)
              );
            const recurse = (
              current: string,
              entityIds: string[],
              relationIds: string[]
            ): void => {
              if (current === to) {
                out.push({ entityIds, relationIds });
                return;
              }
              if (entityIds.length - 1 >= maxDepth) {
                return;
              }
              visited.add(current);
              for (const relation of neighbors(current)) {
                recurse(
                  relation.targetId,
                  [...entityIds, relation.targetId],
                  [...relationIds, relation.id]
                );
              }
              visited.delete(current);
            };
            recurse(from, [from], []);
            return out;
          }),
        queryEntity: (id) =>
          Effect.sync(() => {
            const found = fold().entities.find((entity) => entity.id === id);
            return found === undefined ? Option.none() : Option.some(found);
          }),
        relatedness: (seed, maxDepth = 3) =>
          Effect.sync(() => {
            const { relations } = fold();
            const distance = new Map<string, number>();
            const type = new Map<string, string | null>();
            const expand = (current: string, depth: number): string[] => {
              const reached: string[] = [];
              for (const relation of relations) {
                if (relation.sourceId !== current) {
                  continue;
                }
                const target = relation.targetId;
                if (distance.has(target)) {
                  continue;
                }
                distance.set(target, depth);
                type.set(target, relation.type);
                reached.push(target);
              }
              return reached;
            };
            let frontier = [seed];
            distance.set(seed, 0);
            type.set(seed, null);
            for (let depth = 1; depth <= maxDepth; depth += 1) {
              frontier = frontier.flatMap((current) => expand(current, depth));
            }
            const out: RelatedEntity[] = [];
            for (const [id, dist] of distance) {
              if (id === seed) {
                continue;
              }
              out.push({
                distance: dist,
                entityId: id,
                relationType: type.get(id) ?? null,
              });
            }
            return out.sort((a, b) => a.distance - b.distance);
          }),
        replay: Effect.sync(() => toState(fold())),
        sharedEvidence: Effect.sync(() => {
          const byEvidence = new Map<string, Set<string>>();
          for (const entry of steps) {
            for (const evidenceId of entry.step.evidenceIds) {
              const seen = byEvidence.get(evidenceId) ?? new Set<string>();
              seen.add(entry.investigation);
              byEvidence.set(evidenceId, seen);
            }
          }
          return [...byEvidence.entries()]
            .filter(([, ids]) => ids.size > 1)
            .map(([evidenceId, ids]) =>
              SharedArtifact.make({
                evidenceId,
                investigationIds: [...ids].map(investigationId),
              })
            )
            .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
        }),
        spatial: (bbox) =>
          Effect.sync(() =>
            extents().filter(
              (hit) =>
                hit.lat !== null &&
                hit.lon !== null &&
                hit.lat >= bbox.minLat &&
                hit.lat <= bbox.maxLat &&
                hit.lon >= bbox.minLon &&
                hit.lon <= bbox.maxLon
            )
          ),
        timeline: (from, to) =>
          Effect.sync(() =>
            extents().filter(
              (hit) => hit.validFrom <= to && hit.validTo >= from
            )
          ),
      };

      return store;
    }),
  }
) {}

export const GraphLayer = Layer.effect(GraphService, GraphService.make);
