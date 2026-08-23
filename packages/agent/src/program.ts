import {
  EvidenceBackendFilesystem,
  EvidenceBackendMemory,
  EvidenceRootDir,
  makeEngineLayer,
  OntologyRegistryLayer,
} from "@viokit/engine";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import type { PackManifest } from "@viokit/schema";
import { DuckDBConfig } from "@viokit/schema";
import { DispatchTransportLayer } from "@viokit/sources";
import { Layer } from "effect";

/**
 * The one assembled runtime both front-ends are built from (TDR-016). MCP and
 * CLI are adapters over this layer and hold no behavior of their own (I8), so
 * anything either surface can do, the other can do identically.
 *
 * Deployment wiring only: the transports a pack's sources may declare, where
 * evidence and the graph are stored, and which packs are registered. No policy
 * decisions live here — cache mode and egress route stay owned by the engine's
 * source runtime (I4/I10).
 */

/** Packs registered by default. A pack absent here is invisible to the catalog. */
export const defaultPacks: readonly PackManifest[] = [webDns];

const evidenceRoot = process.env.VIOKIT_EVIDENCE_DIR ?? "";

/**
 * Evidence goes to the filesystem when `VIOKIT_EVIDENCE_DIR` names a directory,
 * and stays in memory otherwise — the same default the engine ships.
 */
const evidenceBackend =
  evidenceRoot.trim() === ""
    ? EvidenceBackendMemory
    : Layer.merge(
        EvidenceBackendFilesystem,
        Layer.succeed(EvidenceRootDir, evidenceRoot)
      );

/**
 * The graph is retained at `VIOKIT_GRAPH_DB` when set (TDR-005 persistence);
 * an empty path selects an anonymous in-memory DuckDB instance.
 */
const graphConfig = Layer.succeed(
  DuckDBConfig,
  process.env.VIOKIT_GRAPH_DB ?? ""
);

const deployment = Layer.mergeAll(
  DispatchTransportLayer,
  evidenceBackend,
  OntologyRegistryLayer,
  graphConfig
);

/** Build a program layer over an explicit pack set (used by tests and hosts). */
export const makeAgentProgramLayer = (packs: readonly PackManifest[]) =>
  Layer.provide(makeEngineLayer(packs), deployment);

/** The default program layer: the packs in `defaultPacks`. */
export const AgentProgramLayer = makeAgentProgramLayer(defaultPacks);
