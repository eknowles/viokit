import { loadViokitConfig, type ViokitConfig } from "@viokit/config";
import { Effect, Layer } from "effect";
import { SourceCatalogLayer } from "./catalog.js";
import { makePromoterLayer } from "./promoter.js";
import { makeSourceCatalogSqliteLayerFor } from "./sqlite.js";

/**
 * The fully-assembled runtime for the five discovery operations: SQLite-backed
 * store (TDR-013) + filesystem promoter, composed under one service so MCP and
 * CLI exercise identical paths (I8).
 *
 * Every path comes from the resolved `ViokitConfig`, so the catalog and the
 * pack output land in the same place regardless of the working directory.
 */
export const makeSourceCatalogProgramLayer = (config: ViokitConfig) =>
  SourceCatalogLayer.pipe(
    Layer.provide(makePromoterLayer(config.packsDir)),
    Layer.provide(makeSourceCatalogSqliteLayerFor(config.catalogDb))
  );

/**
 * The default runtime, resolving config when the layer is built rather than at
 * module load. Set `VIOKIT_CATALOG_DB`/`VIOKIT_PACKS_DIR`, or add a
 * `viokit.config.json` at the workspace root, to relocate either path.
 */
export const SourceCatalogProgramLayer = Layer.unwrap(
  Effect.map(loadViokitConfig(), makeSourceCatalogProgramLayer)
);
