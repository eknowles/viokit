import { readFile as readFileNode } from "node:fs/promises";
import { SourceError, SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";

/**
 * The `transport: "dataset"` producer (task 5.1): reads a local file (CSV/JSON)
 * whose path is carried in `source.url`. Behind the `SourceTransportService`
 * seam, returning raw bytes. Typed row projections layer on later without
 * changing the seam (per design open-question: default projects to bytes).
 */
export const DatasetTransportLayer: Layer.Layer<
  SourceTransportService,
  never,
  never
> = Layer.succeed(SourceTransportService, {
  fetch: (source) =>
    Effect.tryPromise(() => readFileNode(source.url)).pipe(
      Effect.map((bytes) => ({
        bytes,
        contentType: "application/octet-stream",
      })),
      Effect.mapError((error) =>
        SourceError.make({
          message: `failed to read dataset ${source.url}: ${error.message}`,
        })
      )
    ),
});
