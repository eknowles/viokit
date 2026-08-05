import {
  type Entity,
  type Event,
  GraphState,
  type GraphStore,
  ProvenanceError,
  type Relation,
  type Step,
} from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";

/**
 * In-memory graph store. The step log is append-only (I3); graph state is a
 * fold over the log, so replay reproduces state deterministically. Every insert
 * requires a step referencing at least one evidence id (I2).
 */
export class GraphService extends Context.Service<GraphService, GraphStore>()(
  "GraphService",
  {
    make: Effect.sync(() => {
      const steps: Step[] = [];

      const fold = (): GraphState => {
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

        return GraphState.make({
          entities: Array.from(entities.values()),
          events: Array.from(events.values()),
          relations: Array.from(relations.values()),
        });
      };

      const store: GraphStore = {
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
        queryEntity: (id) =>
          Effect.sync(() => {
            const state = fold();
            const found = state.entities.find((entity) => entity.id === id);
            return found === undefined ? Option.none() : Option.some(found);
          }),
        replay: Effect.sync(() => fold()),
      };

      return store;
    }),
  }
) {}

export const GraphLayer = Layer.effect(GraphService, GraphService.make);
