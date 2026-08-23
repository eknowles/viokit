/**
 * A thin typed wrapper over the local HTTP surface (TDR-017).
 *
 * The console reaches the engine only through operations the other front-ends
 * also expose (I8) — there is no second path here. Statuses already carry
 * meaning, so they become typed failures rather than bodies to be parsed for a
 * clue about what went wrong.
 */

export type FailureKind =
  /** The payload failed the engine's boundary decode (I6). */
  | "invalid"
  /** No such operation on this deployment. */
  | "unknown"
  /** A valid request whose operation failed; `tag` names the engine's error. */
  | "failed"
  /** The surface could not be reached at all. */
  | "unreachable";

export class OperationFailure extends Error {
  readonly kind: FailureKind;
  readonly tag: string | undefined;

  constructor(
    kind: FailureKind,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly tag?: string | undefined;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "OperationFailure";
    this.kind = kind;
    this.tag = options.tag;
  }
}

export interface ArgDeclaration {
  readonly description: string;
  readonly kind: "string" | "number" | "boolean" | "json";
  readonly name: string;
  readonly required: boolean;
}

export interface OperationDeclaration {
  readonly args: readonly ArgDeclaration[];
  readonly description: string;
  readonly name: string;
}

const STATUS = { invalid: 400, notFound: 404, ok: 200, unprocessable: 422 };

const failureFor = (status: number, body: unknown): OperationFailure => {
  const detail =
    typeof body === "object" && body !== null
      ? (body as { error?: string; tag?: string })
      : {};
  const message = detail.error ?? `request failed with status ${status}`;
  if (status === STATUS.notFound) {
    return new OperationFailure("unknown", message, { tag: detail.tag });
  }
  if (status === STATUS.unprocessable) {
    return new OperationFailure("failed", message, { tag: detail.tag });
  }
  return new OperationFailure("invalid", message, { tag: detail.tag });
};

export interface ClientOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly origin?: string;
}

export const defaultOrigin = "http://127.0.0.1:4000";

export const makeClient = (options: ClientOptions = {}) => {
  const origin = options.origin ?? defaultOrigin;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  const request = async (
    path: string,
    init?: RequestInit
  ): Promise<unknown> => {
    let response: Response;
    try {
      response = await doFetch(`${origin}${path}`, init);
    } catch (cause) {
      // biome-ignore lint/style/useErrorCause: forwarded via OperationFailure's options
      throw new OperationFailure(
        "unreachable",
        `could not reach the engine at ${origin}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        { cause }
      );
    }

    const body: unknown = await response.json().catch(() => null);
    if (response.status !== STATUS.ok) {
      throw failureFor(response.status, body);
    }
    return body;
  };

  return {
    /** Run an operation. The engine's decode is authoritative, so its rejection is surfaced as-is. */
    call: (
      name: string,
      args: Record<string, unknown> = {}
    ): Promise<unknown> =>
      request(`/operations/${name}`, {
        body: JSON.stringify(args),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),

    /** What this deployment exposes. Read on load, so a missing operation fails loudly. */
    operations: (): Promise<readonly OperationDeclaration[]> =>
      request("/operations") as Promise<readonly OperationDeclaration[]>,

    origin,
  };
};

export type Client = ReturnType<typeof makeClient>;
