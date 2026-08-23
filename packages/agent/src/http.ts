#!/usr/bin/env bun
import type { Engine } from "@viokit/engine";
import { Cause, Effect, type Layer, ManagedRuntime } from "effect";
import type { AgentOperation } from "./operations.js";
import { findOperation, operations } from "./operations.js";
import { AgentProgramLayer } from "./program.js";

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
 * Unauthenticated by design at this stage: it binds to loopback and must not be
 * exposed beyond the local machine until governance (P4) lands.
 */

/** Status codes, so a client can tell outcomes apart without reading the body. */
const OK = 200;
const BAD_REQUEST = 400; // payload failed to decode (I6)
const NOT_FOUND = 404; // no such route or operation
const UNPROCESSABLE = 422; // valid request, operation failed

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json" },
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

const failureResponse = (cause: Cause.Cause<unknown>): Response => {
  const tag = tagOf(Cause.squash(cause));
  return json(
    {
      error: Cause.pretty(cause),
      ...(tag === undefined ? {} : { tag }),
    },
    tag === undefined || tag === DECODE_FAILURE ? BAD_REQUEST : UNPROCESSABLE
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

    // Discovery: the surface describes itself, the same principle the catalog
    // applies to sources and transforms — a client needs no out-of-band
    // knowledge to build a valid call.
    if (request.method === "GET" && pathname === "/operations") {
      return json(operations.map(describeOperation), OK);
    }

    const match = OPERATION_PATH.exec(pathname);
    if (request.method === "POST" && match) {
      const name = match[1] ?? "";
      const operation = findOperation(name);
      if (operation === undefined) {
        return json({ error: `no operation named '${name}'` }, NOT_FOUND);
      }
      const args = await readArgs(request);
      return await runtime.runPromise(
        operation.run(args).pipe(
          Effect.matchCause({
            onFailure: failureResponse,
            onSuccess: (value) => json(value ?? null, OK),
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

/** Serve the surface. Loopback by default — this is a local interface. */
export const serve = (options: ServeOptions = {}) => {
  const handler = makeHandler(options.layer ?? AgentProgramLayer);
  // biome-ignore lint/correctness/noUndeclaredVariables: Bun global, typed via bun-types
  return Bun.serve({
    fetch: (request) => handler(request),
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 4000,
  });
};

if (import.meta.main) {
  const server = serve({
    hostname: process.env.VIOKIT_HTTP_HOST ?? "127.0.0.1",
    port: Number(process.env.VIOKIT_HTTP_PORT ?? 4000),
  });
  process.stdout.write(
    `viokit http api on http://${server.hostname}:${server.port} (loopback only; unauthenticated)\n`
  );
}
