# Working on Viokit

## Environment

The toolchain is pinned with [devbox](https://www.jetify.com/devbox):

```sh
devbox shell        # enter the environment
devbox run setup    # bun install
devbox run test     # every suite
devbox run check    # lint + format
devbox run api      # the local HTTP surface, on :4000
devbox run console  # the console, on :5173
```

### Why Bun comes from two places

`devbox.json` pins **bun 1.3.13** from nixpkgs, but the workspace runs on **1.4.0**, installed as a
devDependency. Both are deliberate:

- Bun 1.4 introduced `Bun.WebView`, which the browser transport needs (TDR-019). Nixpkgs has not
  shipped 1.4 yet — `devbox add bun@1.4.0` fails with *package not found*.
- So nix provides a **bootstrap** bun (you need one to run `bun install` at all), and the workspace
  pins the exact version. `init_hook` puts `node_modules/.bin` first on `PATH`, so inside the devbox
  shell `bun` resolves to 1.4.0.

Collapse this back to one source the moment nixpkgs ships 1.4: drop the devDependency and bump the
`devbox.json` pin.

Nothing here touches your system Bun install.

## Credentials

Copy `.env.example` to `.env` and fill in what you have. `.env` is gitignored;
Bun loads it from the repo root automatically, so the CLI, the API, and the tests
all see it.

Source credentials work by **reference** (TDR-018). A `SourceSpec` carries the
*name* of the variable and how to apply it — never the value:

```ts
auth: { secretRef: "SECURITYTRAILS_API_KEY", scheme: "header", name: "APIKEY" }
```

Packs are tracked source, so a spec that *could* hold a secret eventually would.
An unset or empty variable resolves to absent rather than to `""`, so the catalog
reports the source as not runnable instead of failing at acquisition with a
puzzling 401.

`export`ing in your shell works too, but it leaks into shell history and `ps`.
There is also a file-backed provider in `packages/engine/src/secrets.ts` reading a
JSON object of reference → value — it is written and **not wired into any
deployment**, so it does nothing until someone provides that layer.

## Verifying browser-facing changes

**Check them from a browser.** `curl`, `Bun.fetch`, and tests that call a handler
directly are not subject to CORS, cookies, or the same-origin policy — so a surface
built for a browser can pass all of them and still be unreachable from one.

This is not hypothetical: the HTTP API shipped with no CORS handling at all, and the
console could not reach it. Every live check had used a server-side client.

`Bun.WebView` (already a dependency, see TDR-019) drives a real headless browser, so
a check is cheap:

```ts
const view = new Bun.WebView({ backend: { type: "chrome" }, headless: true });
await view.navigate("http://localhost:5173/");
const result = await view.evaluate(`fetch("http://127.0.0.1:4000/operations").then(r => r.status)`);
```
