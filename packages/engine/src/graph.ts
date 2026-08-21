import {
  type Entity,
  type Event,
  type ExtentHit,
  type GraphPath,
  GraphState,
  type GraphStore,
  ProvenanceError,
  type RelatedEntity,
  type Relation,
  type Step,
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
      const steps: Step[] = [];

      const fold = (): {
        readonly entities: Entity[];
        readonly relations: Relation[];
        readonly events: Event[];
      } => {
        const entities = new Map<string, Entity>();
        const relations = new Map<string, Relation>();
        const events = new Map<string, Event>();

        for (const step of steps) {
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

      const store: GraphStore = {
        dispose: Effect.void,
        insert: (step) =>
          Effect.gen(function* () {
            if (step.evidenceIds.length === 0) {
              return yield* ProvenanceError.make({
                message: "step must reference at least one evidence id",
              });
            }
            steps.push(step);
            return step;
          }),
        log: Effect.sync(() => Array.from(steps)),
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
            // Tie-break on id so equal-distance results are ordered the same
            // here and in the DuckDB seam, whose GROUP BY is unordered.
            return out.sort(
              (a, b) =>
                a.distance - b.distance || a.entityId.localeCompare(b.entityId)
            );
          }),
        replay: Effect.sync(() => toState(fold())),
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
