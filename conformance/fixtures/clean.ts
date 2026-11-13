// Does no outbound I/O. The conformance check must pass this file.
import { readFile } from "node:fs/promises";

export const readsALocalFile = () => readFile("README.md", "utf8");
