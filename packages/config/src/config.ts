import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { findProjectRoot } from "./root.js";

/** The optional config file, read from the workspace root. */
export const CONFIG_FILE_NAME = "viokit.config.json";

/**
 * Every filesystem location viokit reads or writes, resolved to absolute paths
 * against the workspace root. Entry points take these from the
 * `ViokitConfigService` rather than reading `process.env`/`process.cwd()`
 * themselves, so a CLI behaves the same wherever it is invoked from.
 */
export class ViokitConfig extends Schema.Class<ViokitConfig>("ViokitConfig")({
  cacheDir: Schema.String,
  catalogDb: Schema.String,
  evidenceDir: Schema.String,
  graphDb: Schema.String,
  packsDir: Schema.String,
  root: Schema.String,
}) {}

/** The on-disk shape: every path optional and relative to the root. */
const ViokitConfigFile = Schema.Struct({
  cacheDir: Schema.optionalKey(Schema.String),
  catalogDb: Schema.optionalKey(Schema.String),
  evidenceDir: Schema.optionalKey(Schema.String),
  graphDb: Schema.optionalKey(Schema.String),
  packsDir: Schema.optionalKey(Schema.String),
});
type ViokitConfigFile = typeof ViokitConfigFile.Type;

export class ConfigLoadError extends Schema.TaggedErrorClass<ConfigLoadError>()(
  "ConfigLoadError",
  {
    message: Schema.String,
  }
) {}

type PathKey = keyof ViokitConfigFile;

const DEFAULTS: Record<PathKey, string> = {
  cacheDir: ".viokit/cache",
  catalogDb: ".viokit/catalog.db",
  evidenceDir: ".viokit/evidence",
  graphDb: ".viokit/graph.duckdb",
  packsDir: "packages/sources/packs",
};

const ENV_KEYS: Record<PathKey, string> = {
  cacheDir: "VIOKIT_CACHE_DIR",
  catalogDb: "VIOKIT_CATALOG_DB",
  evidenceDir: "VIOKIT_EVIDENCE_DIR",
  graphDb: "VIOKIT_GRAPH_DB",
  packsDir: "VIOKIT_PACKS_DIR",
};

/** Environment variable naming the workspace root explicitly. */
export const ROOT_ENV_KEY = "VIOKIT_ROOT";

type Env = Readonly<Record<string, string | undefined>>;

const decodeConfigFile = Schema.decodeUnknownSync(ViokitConfigFile);

/** Reads and decodes the config file (I6). A missing file is not an error. */
const readConfigFile = (
  root: string
): Effect.Effect<ViokitConfigFile, ConfigLoadError> =>
  Effect.gen(function* () {
    const path = join(root, CONFIG_FILE_NAME);
    if (!existsSync(path)) {
      return {};
    }
    const raw = yield* Effect.try({
      catch: (cause) =>
        new ConfigLoadError({ message: `unable to read ${path}: ${cause}` }),
      try: () => readFileSync(path, "utf8"),
    });
    const parsed = yield* Effect.try({
      catch: () =>
        new ConfigLoadError({ message: `${path} is not valid JSON` }),
      try: () => JSON.parse(raw) as unknown,
    });
    return yield* Effect.try({
      catch: (cause) =>
        new ConfigLoadError({
          message: `${path} is not a valid viokit config: ${cause}`,
        }),
      try: () => decodeConfigFile(parsed),
    });
  });

const resolvePath = (root: string, value: string): string =>
  isAbsolute(value) ? value : join(root, value);

export interface LoadConfigOptions {
  /** Directory to resolve the workspace root from. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /** Environment to read overrides from. Defaults to `process.env`. */
  readonly env?: Env;
}

/**
 * Resolves configuration from, highest precedence first: environment variables,
 * the `viokit.config.json` at the workspace root, then built-in defaults. This
 * is the single place either is read, so everything downstream takes paths from
 * the decoded `ViokitConfig`.
 */
export const loadViokitConfig = (
  options?: LoadConfigOptions
): Effect.Effect<ViokitConfig, ConfigLoadError> =>
  Effect.gen(function* () {
    const env: Env = options?.env ?? process.env;
    const startDir = options?.cwd ?? process.cwd();
    const root = env[ROOT_ENV_KEY] ?? findProjectRoot(startDir);
    const file = yield* readConfigFile(root);
    const pick = (key: PathKey): string =>
      resolvePath(root, env[ENV_KEYS[key]] ?? file[key] ?? DEFAULTS[key]);
    return ViokitConfig.make({
      cacheDir: pick("cacheDir"),
      catalogDb: pick("catalogDb"),
      evidenceDir: pick("evidenceDir"),
      graphDb: pick("graphDb"),
      packsDir: pick("packsDir"),
      root,
    });
  });

export class ViokitConfigService extends Context.Service<
  ViokitConfigService,
  ViokitConfig
>()("ViokitConfigService") {}

/** Provides an already-resolved config — the form tests and callers should use. */
export const viokitConfigLayerFor = (
  config: ViokitConfig
): Layer.Layer<ViokitConfigService> =>
  Layer.succeed(ViokitConfigService, config);

/** Resolves config from the ambient environment at layer construction. */
export const ViokitConfigLayer: Layer.Layer<
  ViokitConfigService,
  ConfigLoadError
> = Layer.effect(ViokitConfigService, loadViokitConfig());
