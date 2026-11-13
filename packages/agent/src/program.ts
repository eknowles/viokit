import {
  EvidenceBackendFilesystem,
  EvidenceBackendMemory,
  EvidenceRootDir,
  makeEngineLayer,
  makeEnvPrincipalStore,
  makeRunLogLayer,
  makeViewStateLayer,
  OntologyRegistryLayer,
  PRINCIPALS_ENV,
} from "@viokit/engine";
import { manifest as conflictSecurity } from "@viokit/packs/conflict-security/manifest";
import { manifest as corporateFinance } from "@viokit/packs/corporate-finance/manifest";
import { manifest as dataBreaches } from "@viokit/packs/data-breaches/manifest";
import { manifest as environment } from "@viokit/packs/environment/manifest";
import { manifest as geospatialMaps } from "@viokit/packs/geospatial-maps/manifest";
import { manifest as imagery } from "@viokit/packs/imagery/manifest";
import { manifest as mediaForensics } from "@viokit/packs/media-forensics/manifest";
import { manifest as peopleIdentity } from "@viokit/packs/people-identity/manifest";
import { manifest as transportPack } from "@viokit/packs/transport/manifest";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import type { PackManifest } from "@viokit/schema";
import {
  CurrentPrincipal,
  DuckDBConfig,
  TransportCapabilities,
  type Unauthorized,
} from "@viokit/schema";
import {
  BunWebViewEngineLayer,
  containerExecRunnerLayer,
  DispatchTransportLayer,
  HostExecRunnerLayer,
} from "@viokit/sources";
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

/**
 * Packs registered by default. A pack absent here is invisible to the catalog —
 * which is how 29 of 38 promoted sources went unreachable: eight packs had no
 * manifest, and `people-identity` had one that nothing registered.
 */
export const defaultPacks: readonly PackManifest[] = [
  conflictSecurity,
  corporateFinance,
  dataBreaches,
  environment,
  geospatialMaps,
  imagery,
  mediaForensics,
  peopleIdentity,
  transportPack,
  webDns,
];

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
 * Where the investigation tree's run records live. Apart from the evidence
 * store and the step log: they record orchestration, not assertions about the
 * world. Durable, so `tree_show` in a later invocation reads what an earlier
 * `tree_expand` did.
 */
const runLogLayer = makeRunLogLayer(
  process.env.VIOKIT_RUN_LOG_DIR ?? "./.viokit/runs"
);

/**
 * What this deployment can actually perform. The browser engine and the exec
 * runner are wired into the dispatch transport below, so `browser` and `exec`
 * are claimed and those sources become runnable.
 *
 * This list and that wiring have to move together: a deployment that stops
 * providing the engine must stop claiming the transport, or the catalog will
 * advertise sources that acquisition then refuses.
 */
const transportCapabilities = Layer.succeed(TransportCapabilities, [
  "http",
  "dataset",
  "browser",
  "exec",
]);

/** Names the running container exec sources run in (the intended default). */
export const EXEC_CONTAINER_ENV = "VIOKIT_EXEC_CONTAINER";

/**
 * Which runner exec sources use. A named container is the intended deployment;
 * with none named the host runner covers development and tools installed
 * locally. Chosen here, never by a source, so a pack cannot pick where its
 * command runs.
 */
export const execRunnerLayerFor = (container: string | undefined) =>
  container === undefined || container.trim() === ""
    ? HostExecRunnerLayer
    : containerExecRunnerLayer({ container: container.trim() });

const deployment = Layer.mergeAll(
  // Provided *to* dispatch, not merged beside it: dispatch reads the browser
  // engine from its own construction context, so a sibling layer is invisible
  // to it. Merged, this deployment claimed `browser` in its capabilities and
  // then refused every browser acquisition — the exact dishonesty
  // `TransportCapabilities` exists to prevent.
  Layer.provide(
    DispatchTransportLayer,
    Layer.merge(
      BunWebViewEngineLayer,
      execRunnerLayerFor(process.env[EXEC_CONTAINER_ENV])
    )
  ),
  transportCapabilities,
  evidenceBackend,
  OntologyRegistryLayer,
  graphConfig,
  runLogLayer,
  viewStateLayer
);

/** Build a program layer over an explicit pack set (used by tests and hosts). */
export const makeAgentProgramLayer = (packs: readonly PackManifest[]) =>
  Layer.provide(makeEngineLayer(packs), deployment);

/** The default program layer: the packs in `defaultPacks`. */
export const AgentProgramLayer = makeAgentProgramLayer(defaultPacks);

/** How this deployment resolves a credential to a principal (TDR-023). */
export const principalStore = makeEnvPrincipalStore(
  process.env[PRINCIPALS_ENV]
);

/**
 * A token for the local front-ends, where there is no request to carry one.
 *
 * If this deployment authenticates, the CLI and MCP server must present a
 * credential like anyone else: acting as an implicit local operator would be a
 * hole exactly where the machine's owner is most likely to look.
 */
export const LOCAL_TOKEN_ENV = "VIOKIT_TOKEN";

export const localPrincipalLayer: Layer.Layer<CurrentPrincipal, Unauthorized> =
  Layer.effect(
    CurrentPrincipal,
    principalStore.resolve(process.env[LOCAL_TOKEN_ENV])
  );
