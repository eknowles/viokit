import { Live } from "@viokit/schema";

export const pastInput = {
  acquiredAt: new Date("2024-01-01T00:00:00.000Z"),
  acquisitionPath: Live.make({}),
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "application/octet-stream",
  observedAt: new Date("2024-01-01T00:00:00.000Z"),
};
