import { Context, Effect, Schema } from "effect";

/**
 * Who is acting (TDR-023).
 *
 * Nothing in this system could say. The HTTP surface documented itself as
 * loopback-only "until governance lands" — and that was a comment, not a
 * mechanism: one environment variable exposed an unauthenticated engine that
 * could acquire from the network, read every artifact, and export any case.
 *
 * A principal is a person *or an agent*. Giving an agent its own makes "which
 * one acquired this" answerable; an agent borrowing a human's makes it
 * permanently unanswerable, and no later audit work recovers it (I8).
 */

export const PrincipalId = Schema.String.pipe(Schema.brand("PrincipalId"));
export type PrincipalId = typeof PrincipalId.Type;

export const principalId = (value: string): PrincipalId =>
  Schema.decodeUnknownSync(PrincipalId)(value);

export class Principal extends Schema.Class<Principal>("Principal")({
  /** For the trail and the interface; not identity, and it may change. */
  displayName: Schema.String,
  id: PrincipalId,
}) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String,
  }
) {}

/**
 * The single implicit operator of a deployment that has configured no principal
 * store. Local use stays frictionless: a tool that demands a token to look at
 * your own machine gets worked around.
 */
export const LOCAL_PRINCIPAL = Principal.make({
  displayName: "local operator",
  id: principalId("local"),
});

/**
 * Resolves a presented credential to a principal. Deliberately the same shape as
 * `SecretProvider` (TDR-018): an environment backend first, a file backend
 * behind it, an external issuer later, and no consumer changes when that
 * happens.
 */
export interface PrincipalStore {
  /**
   * Whether this deployment authenticates at all. False means local
   * single-user, and is what the loopback bind guard reads.
   */
  readonly authenticates: boolean;
  readonly resolve: (
    credential: string | undefined
  ) => Effect.Effect<Principal, Unauthorized>;
}

export class PrincipalStoreService extends Context.Service<
  PrincipalStoreService,
  PrincipalStore
>()("PrincipalStoreService") {}

/** The principal an operation is running as. Provided per request. */
export class CurrentPrincipal extends Context.Service<
  CurrentPrincipal,
  Principal
>()("CurrentPrincipal") {}

/** No store: one implicit local operator, and nothing to present. */
export const LocalPrincipalStore: PrincipalStore = {
  authenticates: false,
  resolve: () => Effect.succeed(LOCAL_PRINCIPAL),
};
