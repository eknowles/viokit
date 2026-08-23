#!/usr/bin/env bun
import type { Engine } from "@viokit/engine";
import { PRINCIPALS_ENV } from "@viokit/engine";
import { CurrentPrincipal } from "@viokit/schema";
import { Cause, Effect, type Layer, ManagedRuntime } from "effect";
import type { AgentOperation } from "./operations.js";
import { findOperation, operations } from "./operations.js";
import { AgentProgramLayer, principalStore } from "./program.js";

/**
 * The browser-facing front-end (TDR-017). Like the MCP and CLI adapters, this
 * module holds no behavior: it dispatches into the shared operation table and
 * translates outcomes to HTTP. One generic route rather than a declared endpoint
 * per operation, so parity across the three surfaces stays a property of the
 * architecture — a new operation appears on all of them at once — instead of
 * something a test has to defend.
 *
 * Routing is matched here rather than through `HttpRouter`: the surface is two
 * routes, and Effect still owns everything behind the operation table, so the
 * router bought nothing but plumbing. See TDR-017.
 *
 * Authentication is TDR-023: a bearer credential resolved to a principal through
 * the `PrincipalStore` seam. A deployment that configures no principals is local
 * single-user, and `serve` then **refuses to bind anywhere but loopback** — the
 * rule used to be a comment here, and a comment does not stop
 * `VIOKIT_HTTP_HOST=0.0.0.0` from exposing an engine that can acquire from the
 * network, read every artifact, and export any case.
 */

/** Status codes, so a client can tell outcomes apart without reading the body. */
const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400; // payload failed to decode (I6)
const NOT_FOUND = 404; // no such route or operation
const UNPROCESSABLE = 422; // valid request, operation failed

/**
 * The console runs on a different port from the API (Vite in development,
 * possibly a static host later), so every browser call is cross-origin and a
 * POST carrying JSON is preflighted. Without this the console cannot reach the
 * engine at all.
 *
 * Loopback origins only. This surface is unauthenticated by design until
 * governance lands, and `*` would mean any page in the browser could drive an
 * investigation the moment someone bound the server beyond localhost.
 */
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const corsHeaders = (origin: string | null): Record<string, string> => {
  if (origin === null || !LOOPBACK_ORIGIN.test(origin)) {
    return {};
  }
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": origin,
    "access-control-max-age": "600",
    vary: "origin",
  };
};

/** `Authorization: Bearer <credential>`, or nothing. */
const bearer = (header: string | null): string | undefined => {
  if (header === null) {
    return;
  }
  const [scheme, ...rest] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && rest.length > 0
    ? rest.join(" ").trim()
    : undefined;
};

const json = (
  body: unknown,
  status: number,
  origin: string | null = null
): Response =>
  new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
    status,
  });

const describeOperation = (operation: AgentOperation) => ({
  args: operation.args.map((spec) => ({
    description: spec.description,
    kind: spec.kind,
    name: spec.name,
    required: !spec.optional,
  })),
  description: operation.description,
  name: operation.name,
});

/**
 * "You sent something malformed" and "what you asked for did not work" are
 * different answers and get different statuses. A payload that fails the
 * boundary decode surfaces as a `SchemaError`; anything else that fails came
 * from the engine, having accepted the request.
 */
const DECODE_FAILURE = "SchemaError";

const tagOf = (failure: unknown): string | undefined =>
  typeof failure === "object" && failure !== null && "_tag" in failure
    ? String((failure as { _tag: unknown })._tag)
    : undefined;

const failureResponse = (
  cause: Cause.Cause<unknown>,
  origin: string | null
): Response => {
  const tag = tagOf(Cause.squash(cause));
  return json(
    {
      error: Cause.pretty(cause),
      ...(tag === undefined ? {} : { tag }),
    },
    tag === undefined || tag === DECODE_FAILURE ? BAD_REQUEST : UNPROCESSABLE,
    origin
  );
};

const readArgs = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const OPERATION_PATH = /^\/operations\/([^/]+)$/;

/** A standard web handler, so any listener speaking Request/Response serves it. */
export const makeHandler = (
  layer: Layer.Layer<Engine, unknown, never> = AgentProgramLayer
): ((request: Request) => Promise<Response>) => {
  // One runtime for the server's lifetime: building per request would give each
  // request its own graph and evidence store.
  const runtime = ManagedRuntime.make(layer);

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get("origin");

    // Preflight: the browser asks before sending a JSON POST.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(origin),
        status: NO_CONTENT,
      });
    }

    // Discovery: the surface describes itself, the same principle the catalog
    // applies to sources and transforms — a client needs no out-of-band
    // knowledge to build a valid call.
    if (request.method === "GET" && pathname === "/operations") {
      return json(operations.map(describeOperation), OK, origin);
    }

    const match = OPERATION_PATH.exec(pathname);
    if (request.method === "POST" && match) {
      const name = match[1] ?? "";
      const operation = findOperation(name);
      if (operation === undefined) {
        return json(
          { error: `no operation named '${name}'` },
          NOT_FOUND,
          origin
        );
      }
      const args = await readArgs(request);
      const presented = bearer(request.headers.get("authorization"));
      return await runtime.runPromise(
        operation.run(args).pipe(
          Effect.provideServiceEffect(
            CurrentPrincipal,
            principalStore.resolve(presented)
          ),
          Effect.matchCause({
            onFailure: (cause) => failureResponse(cause, origin),
            onSuccess: (value) => json(value ?? null, OK, origin),
          })
        )
      );
    }

    return json(
      { error: `no route for ${request.method} ${pathname}` },
      NOT_FOUND
    );
  };
};

export interface ServeOptions {
  readonly hostname?: string;
  readonly layer?: Layer.Layer<Engine, unknown, never>;
  readonly port?: number;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Refuse to publish an engine nobody authenticates.
 *
 * Pure and exported so it is testable without starting a server — the rule this
 * enforces used to be a sentence in a comment, and a sentence does not stop
 * `VIOKIT_HTTP_HOST=0.0.0.0`.
 */
export const assertBindable = (
  hostname: string,
  authenticates: boolean
): void => {
  if (LOOPBACK_HOSTS.has(hostname) || authenticates) {
    return;
  }
  throw new Error(
    `refusing to bind to ${hostname}: this deployment authenticates nobody, so anyone who can reach the port could drive it. Configure ${PRINCIPALS_ENV}, or bind to loopback.`
  );
};

/**
 * Serve the surface. Loopback by default, and loopback *only* unless this
 * deployment authenticates.
 *
 * The refusal is the point. Binding wider without a principal store publishes an
 * engine that anyone reaching the port can drive — and until now the only thing
 * preventing it was a sentence in a comment.
 */
export const serve = (options: ServeOptions = {}) => {
  const hostname = options.hostname ?? "127.0.0.1";
  assertBindable(hostname, principalStore.authenticates);
  const handler = makeHandler(options.layer ?? AgentProgramLayer);
  // biome-ignore lint/correctness/noUndeclaredVariables: Bun global, typed via bun-types
  return Bun.serve({
    fetch: (request) => handler(request),
    hostname,
    port: options.port ?? 4000,
  });
};

if (import.meta.main) {
  const server = serve({
    hostname: process.env.VIOKIT_HTTP_HOST ?? "127.0.0.1",
    port: Number(process.env.VIOKIT_HTTP_PORT ?? 4000),
  });
  process.stdout.write(
    `viokit http api on http://${server.hostname}:${server.port} (${
      principalStore.authenticates
        ? "authenticating"
        : "local single-user; loopback only"
    })\n`
  );
}
