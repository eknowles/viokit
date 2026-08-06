import { Layer } from "effect";
import { SourceCatalogLayer } from "./catalog.js";
import { PromoterLayer } from "./promoter.js";
import { makeSourceCatalogSqliteLayerFor } from "./sqlite.js";

/**
 * The fully-assembled runtime for the five discovery operations: SQLite-backed
 * store (TDR-013) + filesystem promoter, composed under one service so MCP and
 * CLI exercise identical paths (I8).
 *
 * The store is a single SQLite file so agents/processes share a durable catalog.
 * Set `VIOKIT_CATALOG_DB` to relocate it (default `./.viokit/catalog.db`).
 */
export const SourceCatalogProgramLayer = SourceCatalogLayer.pipe(
  Layer.provide(PromoterLayer),
  Layer.provide(
    makeSourceCatalogSqliteLayerFor(
      process.env.VIOKIT_CATALOG_DB ?? "./.viokit/catalog.db"
    )
  )
);
