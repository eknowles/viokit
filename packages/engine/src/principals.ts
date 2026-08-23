import type { Principal, PrincipalStore } from "@viokit/schema";
import {
  LocalPrincipalStore,
  PrincipalStoreService,
  principalId,
  Unauthorized,
} from "@viokit/schema";
import { Effect, Layer } from "effect";

/**
 * Resolving a presented credential to a principal (TDR-023).
 *
 * The environment backend first, exactly as TDR-018 chose for secrets: one seam
 * pattern in this codebase rather than two, and an external issuer later changes
 * no consumer.
 */

/**
 * `VIOKIT_PRINCIPALS` as `token=id:Display Name` entries, separated by newlines
 * or semicolons. Absent means this deployment does not authenticate — local
 * single-user, loopback only, which is the frictionless default the decision
 * turned on.
 */
export const PRINCIPALS_ENV = "VIOKIT_PRINCIPALS";

/** Entries separated by newlines or semicolons. */
const SEPARATOR = /[\n;]/;

const parse = (raw: string): ReadonlyMap<string, Principal> => {
  const entries = new Map<string, Principal>();
  for (const line of raw.split(SEPARATOR)) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    const equals = trimmed.indexOf("=");
    if (equals <= 0) {
      continue;
    }
    const token = trimmed.slice(0, equals).trim();
    const rest = trimmed.slice(equals + 1).trim();
    const colon = rest.indexOf(":");
    const id = colon === -1 ? rest : rest.slice(0, colon).trim();
    const displayName = colon === -1 ? rest : rest.slice(colon + 1).trim();
    if (token === "" || id === "") {
      continue;
    }
    entries.set(token, {
      displayName: displayName === "" ? id : displayName,
      id: principalId(id),
    } as Principal);
  }
  return entries;
};

export const makeEnvPrincipalStore = (
  raw: string | undefined
): PrincipalStore => {
  const configured = raw ?? "";
  if (configured.trim() === "") {
    return LocalPrincipalStore;
  }
  const byToken = parse(configured);
  return {
    authenticates: true,
    resolve: (credential) => {
      if (credential === undefined || credential === "") {
        return Unauthorized.make({
          message: "this deployment authenticates; present a credential",
        });
      }
      const found = byToken.get(credential);
      return found === undefined
        ? Unauthorized.make({ message: "credential not recognised" })
        : Effect.succeed(found);
    },
  };
};

/** The default: whatever the environment says, or local single-user. */
export const PrincipalStoreLayer: Layer.Layer<PrincipalStoreService> =
  Layer.sync(PrincipalStoreService, () =>
    makeEnvPrincipalStore(process.env[PRINCIPALS_ENV])
  );
