import {
  EvidenceBackendFilesystem,
  EvidenceBackendMemory,
  EvidenceRootDir,
  makeEngineLayer,
  makeViewStateLayer,
  OntologyRegistryLayer,
} from "@viokit/engine";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import type { PackManifest } from "@viokit/schema";
import { DuckDBConfig, TransportCapabilities } from "@viokit/schema";
import { BunWebViewEngineLayer, DispatchTransportLayer } from "@viokit/sources";
import { Layer } from "effect";

/**
 * The one assembled runtime both front-ends are built from (TDR-016). MCP and
 * CLI are adapters over this layer and hold no behavior of their own (I8), so
 * anything either surface can do, the other can do identically.
 *
 * Deployment wiring only: the transports this deployment can perform, where
 * evidence, view state, and the graph are stored, and which packs are
 * registered. No policy
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

/**
 * Where view state lives (TDR-012). Kept apart from the graph and evidence
 * stores: configuration must never travel with the evidentiary record.
 */
const viewStateLayer = makeViewStateLayer(
  process.env.VIOKIT_VIEW_STATE_DIR ?? "./.viokit/view-state"
);

/**
 * What this deployment can actually perform. Declared from what is wired, not
 * asserted: the browser engine is present, so `browser` is claimed and browser
 * sources become runnable. Remove the engine and the claim goes with it, so a
 * deployment never promises a transport it does not have.
 */
const transportCapabilities = Layer.succeed(TransportCapabilities, [
  "http",
  "dataset",
  "browser",
]);

const deployment = Layer.mergeAll(
  DispatchTransportLayer,
  BunWebViewEngineLayer,
  transportCapabilities,
  evidenceBackend,
  OntologyRegistryLayer,
  graphConfig,
  viewStateLayer
);

/** Build a program layer over an explicit pack set (used by tests and hosts). */
export const makeAgentProgramLayer = (packs: readonly PackManifest[]) =>
  Layer.provide(makeEngineLayer(packs), deployment);

/** The default program layer: the packs in `defaultPacks`. */
export const AgentProgramLayer = makeAgentProgramLayer(defaultPacks);
