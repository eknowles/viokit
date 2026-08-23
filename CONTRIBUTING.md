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
