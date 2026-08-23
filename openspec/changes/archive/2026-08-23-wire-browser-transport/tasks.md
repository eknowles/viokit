# Tasks — Wire the Browser Transport

> Finishes `browser-transport`, which built the transport but wired it to nothing.

## 1. Wiring

- [x] 1.1 The program layer provides the browser engine.
- [x] 1.2 The deployment declares its transports, including `browser`, so runnability derives from what is wired.
- [x] 1.3 A deployment without a browser engine keeps reporting browser sources as blocked.
- [x] 1.4 Tests: declaring the transport flips runnability; the catalog and acquisition agree.

## 2. Packs

- [x] 2.1 `people-identity`'s browser-only sources declare the browser transport.
- [x] 2.2 Test: those sources report runnable in a browser-equipped deployment and blocked without one.

## 3. Closing the live gaps

- [x] 3.1 A conforming forward proxy in the live test — **found** that proxy binding is per browser process and processes are reused, so a later acquisition inherits the first route (I10 hazard).
- [x] 3.2 Refuse proxied browser acquisition rather than promise an unguaranteeable route; record the finding in TDR-019 and the live test.
- [x] 3.3 Ran manually; direct-egress browser acquisition renders a real page into evidence.

## 4. Verification

- [x] 4.1 Typechecks, suites, lint clean via devbox.
- [x] 4.2 Invariant checklist, with I10 and TDR-011 called out.
