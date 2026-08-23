import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  AlreadyPromoted,
  ClaimConflict,
  SourceAccess,
  SourceCandidate,
  SourceCandidateId,
  SourceCandidateInput,
  SourceCandidateStatus,
  SourceTransportKind,
} from "../src/index.js";

describe("SourceCandidate identity (R3, I6)", () => {
  it("decodes a thin submission: identity, where it came from, nothing else", () => {
    const input = Schema.decodeUnknownSync(SourceCandidateInput)({
      archetypes: ["lookup", "extract"],
      category: "web-dns",
      domain: "shodan",
      origin: "https://awesome-osint.test/list#shodan",
      url: "https://www.shodan.io/",
    });
    assert.strictEqual(input.domain, "shodan");
    assert.strictEqual(input.category, "web-dns");
    // Classification stays optional — an agent submits fast and enriches later.
    assert.strictEqual(input.access, undefined);
    assert.strictEqual(input.transport, undefined);
  });

  /**
   * The first 47 candidates arrived with `origin` empty, and afterwards there
   * was no way to tell a checked source from an asserted one. A lead nobody can
   * trace back is not a lead.
   */
  it("rejects a submission that cannot be traced back", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(SourceCandidateInput)({
        archetypes: ["lookup"],
        category: "web-dns",
        domain: "shodan",
        url: "https://www.shodan.io/",
      })
    );
  });

  it("rejects a submission missing identity (I6)", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(SourceCandidateInput)({
        domain: "shodan",
        url: "https://x",
      })
    );
  });

  it("rejects an empty archetypes list", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(SourceCandidateInput)({
        archetypes: [],
        category: "web-dns",
        domain: "shodan",
        url: "https://x",
      })
    );
  });
});

describe("SourceCandidate stored record", () => {
  it("decodes an enriched record with status and notes", () => {
    const id = SourceCandidateId.make("abc");
    const candidate = SourceCandidate.make({
      access: "requires_key",
      archetypes: ["lookup", "extract"],
      category: "web-dns",
      description: "Internet-wide port/device search",
      discoveredAt: new Date("2026-08-05T00:00:00.000Z"),
      discoveredBy: "agent-7",
      domain: "shodan",
      id,
      notes: [],
      origin: "bellingcat-csv",
      status: "new",
      transport: "http",
      url: "https://www.shodan.io/",
    });
    const decoded = Schema.decodeUnknownSync(SourceCandidate)(candidate);
    assert.strictEqual(decoded.status, "new");
    assert.strictEqual(decoded.access, "requires_key");
    assert.strictEqual(decoded.transport, "http");
    assert.strictEqual(decoded.notes.length, 0);
  });

  it("round-trips all status/access/transport variants", () => {
    for (const status of SourceCandidateStatus.literals) {
      assert.strictEqual(
        Schema.decodeUnknownSync(SourceCandidateStatus)(status),
        status
      );
    }
    for (const access of SourceAccess.literals) {
      assert.strictEqual(
        Schema.decodeUnknownSync(SourceAccess)(access),
        access
      );
    }
    for (const transport of SourceTransportKind.literals) {
      assert.strictEqual(
        Schema.decodeUnknownSync(SourceTransportKind)(transport),
        transport
      );
    }
  });

  it("exposes tagged error classes with instance _tag", () => {
    const claim = ClaimConflict.make({ message: "claimed" });
    const promoted = AlreadyPromoted.make({ message: "promoted" });
    assert.strictEqual(claim._tag, "ClaimConflict");
    assert.strictEqual(promoted._tag, "AlreadyPromoted");
  });
});
