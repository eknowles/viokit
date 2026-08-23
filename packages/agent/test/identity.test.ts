import { describe, expect, it } from "@effect/vitest";
import { makeEnvPrincipalStore, PRINCIPALS_ENV } from "@viokit/engine";
import { Effect } from "effect";
import { assertBindable } from "../src/http.js";

/**
 * Identity at the boundary (TDR-023).
 *
 * The bind guard is the part that closes a live hazard: the loopback rule was a
 * comment, and `VIOKIT_HTTP_HOST=0.0.0.0` published an engine that anyone
 * reaching the port could drive.
 */

const resolve = (raw: string | undefined, credential: string | undefined) =>
  Effect.runPromise(
    Effect.result(makeEnvPrincipalStore(raw).resolve(credential))
  );

describe("resolving a credential to a principal", () => {
  it("is local single-user when nothing is configured", async () => {
    const store = makeEnvPrincipalStore(undefined);
    expect(store.authenticates).toBe(false);
    const result = await resolve(undefined, undefined);
    expect(result._tag).toBe("Success");
  });

  it("resolves a configured token to its principal", async () => {
    const result = await resolve("tok-a=ana:Ana Ruiz", "tok-a");
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(String(result.success.id)).toBe("ana");
      expect(result.success.displayName).toBe("Ana Ruiz");
    }
  });

  it("reads several principals, separated by lines or semicolons", async () => {
    const raw = "tok-a=ana:Ana\ntok-b=bo:Bo";
    expect((await resolve(raw, "tok-b"))._tag).toBe("Success");
    expect((await resolve(raw, "tok-a"))._tag).toBe("Success");
  });

  it("refuses an unrecognised credential", async () => {
    const result = await resolve("tok-a=ana:Ana", "nope");
    expect(result._tag).toBe("Failure");
  });

  /** The local operator must not survive as a fallback once tokens exist. */
  it("refuses no credential at all once it authenticates", async () => {
    const result = await resolve("tok-a=ana:Ana", undefined);
    expect(result._tag).toBe("Failure");
  });

  it("falls back to the id when no display name is given", async () => {
    const result = await resolve("tok-a=ana", "tok-a");
    if (result._tag === "Success") {
      expect(result.success.displayName).toBe("ana");
    }
  });
});

describe("the loopback bind guard", () => {
  it("refuses a non-loopback bind when nobody is authenticated", () => {
    expect(() => assertBindable("0.0.0.0", false)).toThrow("refusing to bind");
    expect(() => assertBindable("192.168.1.10", false)).toThrow();
  });

  it("allows loopback whether or not anyone is authenticated", () => {
    expect(() => assertBindable("127.0.0.1", false)).not.toThrow();
    expect(() => assertBindable("localhost", false)).not.toThrow();
    expect(() => assertBindable("[::1]", false)).not.toThrow();
  });

  /** Binding wide is a deployment's choice once it can say who is calling. */
  it("allows a wider bind once the deployment authenticates", () => {
    expect(() => assertBindable("0.0.0.0", true)).not.toThrow();
  });

  it("names what would let the bind through", () => {
    expect(() => assertBindable("0.0.0.0", false)).toThrow(PRINCIPALS_ENV);
  });
});
