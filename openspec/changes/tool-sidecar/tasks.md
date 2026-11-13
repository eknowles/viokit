## 1. Image

- [x] 1.1 Keep `sidecar/Dockerfile` as spiked (slim Kali, wrapped tools, non-root user, no mounts) and add a `.dockerignore`; verify `docker build` succeeds and the image is under 300 MB

## 2. Control script

- [x] 2.1 Write `scripts/sidecar.ts` with `build`, `up`, `down`, `status` and `env`, built from pure functions that return the docker argument arrays; verify unit tests with a fake `docker` cover each command's exact line, idempotent `up`, and the three `status` states
- [x] 2.2 Add the `--net-raw` flag to `up`, off by default; verify the default line has no `--cap-add` and the flagged line has `--cap-add NET_RAW`
- [x] 2.3 Add an opt-in live test (skipped unless `VIOKIT_SIDECAR_LIVE` is set) that builds, starts, runs `id`, `dig`, a connect scan and a default SYN scan, then a `--net-raw` SYN scan, then stops; verify it passes against real Docker here
- [x] 2.4 Add the `sidecar` script to `package.json`; verify `bun run sidecar --help` prints usage

## 3. End to end

- [x] 3.1 Add an opt-in test that runs `dig` through the engine's container runner against the real sidecar, and the timeout-leak check against it; verify both pass here
- [x] 3.2 Update `docs/PROJECT_PICTURE.md` and the exec-transport doc note with how to start the sidecar and point the engine at it; verify `bun run check` is clean
