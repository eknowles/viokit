import { afterAll, describe, expect, it } from "bun:test";
import { CONTAINER, realDocker, run } from "./sidecar.js";

/**
 * Against real Docker. Opt-in: set VIOKIT_SIDECAR_LIVE=1. It builds the image,
 * starts the container, and stops it afterwards.
 */
const live = process.env.VIOKIT_SIDECAR_LIVE !== undefined;
const SYN_REFUSED = /raw socket/i;

const inside = async (...cmd: string[]) => {
  const result = await realDocker(["exec", CONTAINER, ...cmd]);
  return `${result.stdout}${result.stderr}`;
};

afterAll(async () => {
  if (live) {
    await run(["down"], realDocker);
  }
});

describe.skipIf(!live)("tool sidecar against real docker (opt-in)", () => {
  it("builds, starts without raw sockets, and the tools behave", async () => {
    expect((await run(["build"], realDocker)).code).toBe(0);
    await run(["down"], realDocker);
    expect((await run(["up"], realDocker)).code).toBe(0);
    expect((await run(["status"], realDocker)).message).toBe("running");
    // A second start must not create a second container.
    expect((await run(["up"], realDocker)).message).toContain(
      "already running"
    );

    expect((await inside("id", "-un")).trim()).toBe("tools");
    const bins = ["timeout", "pgrep", "dig", "whois", "nmap"];
    const found = await Promise.all(
      bins.map((bin) => inside("sh", "-c", `command -v ${bin}`))
    );
    for (const [index, line] of found.entries()) {
      expect(line).toContain(bins[index] ?? "");
    }
    expect(await inside("nmap", "-sT", "-p", "22", "127.0.0.1")).toContain(
      "Host is up"
    );
    expect(await inside("nmap", "-sS", "-p", "22", "127.0.0.1")).toMatch(
      SYN_REFUSED
    );
    expect(await inside("ls", "/home/user")).toContain("No such file");
  }, 120_000);

  it("grants raw sockets only when asked", async () => {
    await run(["down"], realDocker);
    expect((await run(["up", "--net-raw"], realDocker)).code).toBe(0);
    const out = await inside("nmap", "-sS", "-p", "22", "127.0.0.1");
    expect(out).not.toMatch(SYN_REFUSED);
    expect(out).toContain("Host is up");
    // The opt-in is explicit about its cost: it runs as root.
    expect((await inside("id", "-un")).trim()).toBe("root");
  }, 120_000);
});
