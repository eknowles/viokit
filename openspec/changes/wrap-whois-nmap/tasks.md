## 1. Sources and projections

- [x] 1.1 Add the whois and nmap sources and the shared `graph.ts` helpers; verify typecheck and lint are clean
- [x] 1.2 Add `whois.ts` and `nmap.ts` projections and register both transforms; verify 7 projection tests pass against captured real output, including the dig/nmap shared-node test

## 2. Image, vocabulary and tests

- [x] 2.1 Add `netbase` to the sidecar image; verify `whois` runs in a rebuilt container
- [x] 2.2 Extend the vocabulary scan to the entity helpers and its control fixture; verify the scan flags an unknown kind passed to a helper
- [x] 2.3 Derive the three count assertions from the manifests; verify engine and agent suites pass
- [x] 2.4 Break relatedness ties by entity id; verify `mini-investigation` passes 14 of 14 runs

## 3. End to end

- [x] 3.1 Add opt-in live tests for whois, nmap and an option-shaped value through the real deployment into the sidecar; verify they pass against the live sidecar and skip without it
