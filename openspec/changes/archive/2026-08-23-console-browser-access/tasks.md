# Tasks — Console Browser Access

> A defect fix. The console was correct; it was blocked before reaching the network.

- [x] 1.1 Answer preflight requests.
- [x] 1.2 Carry CORS headers on every response, failures included.
- [x] 1.3 Restrict to loopback origins.
- [x] 1.4 Regression tests: preflight, loopback allowed, non-loopback refused, no-origin unaffected, headers on failures.
- [x] 1.5 Verify from an actual browser, not a server-side client — the gap that let this ship.
- [x] 1.6 Record the verification gap so the next browser-facing change is checked from a browser.
