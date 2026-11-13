## Context

The exec transport, the sidecar and the shared vocabulary exist. `dig` shows the pattern: a source with typed parameters, a projection from evidence bytes to graph operations, tested from captured output. See `proposal.md`.

## Spike

Run 2026-11-13 against the real sidecar (Docker 27.3.1, Kali rolling, nmap 7.991).

| Question | Result |
|---|---|
| Does `whois` work in the sidecar as built? | **No.** `getaddrinfo(whois.verisign-grs.com): Servname not supported for ai_socktype`: the image has no `/etc/services`. Adding `netbase` fixed it. Found only by running the real tool. |
| What does a real registry record look like? | 67 lines for `example.com`: `Key: value`, a thin registry record with name servers in capitals and no registrant. Captured as a fixture. |
| Does the nmap scan need a raw socket? | **No.** `-sT` (connect) works in the default, unprivileged sidecar. |
| What does the scan return? | Real XML for `scanme.nmap.org` (a host the nmap project publishes for testing): three open ports (22, 53, 80) with products and versions. 8 seconds for the top 100 ports with `-sV --version-light`. |
| Do the tools' entities meet? | Yes, after giving an IP address a plain-value id in both projections. Verified by a test. |
| Does the vocabulary scan see the new kinds? | **No**, at first: kinds passed as `entityOfKind("organization", …)` are not `kind:` fields. The scan now reads those calls too. |
| Do existing tests tolerate a new tool? | **No.** Three assertions hard-coded counts (40 sources, web-dns 11 sources, 4 transforms), so every new tool edits an existing test, which the held-out guard forbids for agents. They are derived from the manifests now. |
| Why did `mini-investigation` fail? | It was flaky on a clean `main` (4 of 8 runs): `ORDER BY distance` gives equal-distance entities in arbitrary order. A tie-break by entity id fixed it (14 of 14 runs pass). |

## Decisions

### 1. One file per tool for its projection, shared helpers in `graph.ts`
So tools written in parallel do not edit the same file. The helpers moved out of `manifest.ts` unchanged.

### 2. Ids: plain value for domains and addresses, prefixed for everything else
`domain` and `ip-address` ids are the plain value so any tool reporting them lands on one node. Other kinds are `kind:value`, so an organization named like a domain cannot collide with it.

### 3. nmap XML read by pattern, no parser
No dependency. The elements and quoted attributes are stable; entities are decoded. The limit is a malformed document, which derives nothing.

### 4. A fixed, bounded scan
`-sT -Pn -sV --version-light -T4 --max-retries 1 --top-ports 100`, 120 s timeout. The only input is the address.

### 5. whois reads only keys that mean the same across registries
Name servers, registrant organization, and registrant, admin and tech emails. The registrar is not modelled: the vocabulary has no kind for it.

## Risks / Trade-offs

- **whois formats vary by registry** → only common keys are read; thick records are tested with a synthetic fixture, not a captured one.
- **Scanning a third party** → the live test uses the nmap project's published test host, on a bounded scan.
- **The derived counts weaken a tripwire** → the per-pack test still fails on any shipped-but-unregistered source.
