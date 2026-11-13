// A deliberate violation of I4/I10. The conformance check MUST flag this file;
// the control test fails if it does not. Never import this from real code.
import { spawn } from "node:child_process";

export const callsTheNetwork = () => fetch("https://example.com");
export const startsAProcess = () => spawn("dig", ["example.com"]);
