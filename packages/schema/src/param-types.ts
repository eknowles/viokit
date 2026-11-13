import type { ExecParam } from "./schemas.js";

/**
 * Validation of the values bound into an `exec` source's arguments.
 *
 * An argument array stops shell injection but not option injection (a value of
 * `--version` is still parsed as a flag by the tool), so every value is checked
 * against the type its parameter declares and a value that could be read as an
 * option is refused outright (design.md decision 4). No `node:net` here: this
 * package holds no I/O, so addresses are parsed by hand.
 */

const DOMAIN_LABEL = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/;
const DOMAIN_MAX_LENGTH = 253;
const DECIMAL = /^\d+$/;
const INTEGER = /^\d{1,15}$/;
const TOKEN = /^[A-Za-z0-9_][A-Za-z0-9_.:@=,+-]{0,127}$/;
const IPV4_OCTET_MAX = 255;
const IPV4_OCTETS = 4;
const IPV4_MAX_PREFIX = 32;
const IPV6_MAX_PREFIX = 128;
const IPV6_GROUPS = 8;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;
const WHITESPACE = /\s/;
const FORBIDDEN_CHARACTERS = /[\0\n\r]/;

const isDomain = (value: string): boolean => {
  if (value.length > DOMAIN_MAX_LENGTH) {
    return false;
  }
  const labels = value.toLowerCase().split(".");
  return (
    labels.length >= 2 && labels.every((label) => DOMAIN_LABEL.test(label))
  );
};

const isIpv4 = (value: string): boolean => {
  const octets = value.split(".");
  return (
    octets.length === IPV4_OCTETS &&
    octets.every(
      (octet) =>
        DECIMAL.test(octet) &&
        octet.length <= 3 &&
        Number(octet) <= IPV4_OCTET_MAX &&
        (octet === "0" || !octet.startsWith("0"))
    )
  );
};

const ipv6Groups = (side: string): number | undefined => {
  if (side === "") {
    return 0;
  }
  const parts = side.split(":");
  const last = parts.at(-1) ?? "";
  // An embedded IPv4 tail stands for two groups.
  const tailIsV4 = last.includes(".");
  if (tailIsV4 && !isIpv4(last)) {
    return;
  }
  const hex = tailIsV4 ? parts.slice(0, -1) : parts;
  if (!hex.every((part) => IPV6_GROUP.test(part))) {
    return;
  }
  return hex.length + (tailIsV4 ? 2 : 0);
};

const isIpv6 = (value: string): boolean => {
  if (!value.includes(":")) {
    return false;
  }
  const halves = value.split("::");
  if (halves.length > 2) {
    return false;
  }
  const [head = "", tail = ""] = halves;
  const headGroups = ipv6Groups(head);
  const tailGroups = halves.length === 2 ? ipv6Groups(tail) : 0;
  if (headGroups === undefined || tailGroups === undefined) {
    return false;
  }
  return halves.length === 2
    ? headGroups + tailGroups < IPV6_GROUPS
    : headGroups === IPV6_GROUPS;
};

const isIp = (value: string): boolean => isIpv4(value) || isIpv6(value);

const isCidr = (value: string): boolean => {
  const [address, prefix, ...rest] = value.split("/");
  if (
    address === undefined ||
    prefix === undefined ||
    rest.length > 0 ||
    !DECIMAL.test(prefix)
  ) {
    return false;
  }
  if (isIpv4(address)) {
    return Number(prefix) <= IPV4_MAX_PREFIX;
  }
  return isIpv6(address) && Number(prefix) <= IPV6_MAX_PREFIX;
};

const isUrl = (value: string): boolean => {
  if (WHITESPACE.test(value)) {
    return false;
  }
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Why `value` cannot be bound to `param`, or `undefined` when it can. The
 * reason names the parameter and, for a type mismatch, the type.
 */
export const refusalFor = (
  param: ExecParam,
  value: unknown
): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") {
    return `parameter '${param.name}' must be a ${param.type}`;
  }
  const text = String(value);
  if (text.startsWith("-")) {
    return `parameter '${param.name}' may not start with '-', which a tool would read as an option`;
  }
  if (FORBIDDEN_CHARACTERS.test(text)) {
    return `parameter '${param.name}' may not contain a NUL or a newline`;
  }
  const mismatch = `parameter '${param.name}' is not a valid ${param.type}`;
  switch (param.type) {
    case "domain":
      return isDomain(text) ? undefined : mismatch;
    case "ip":
      return isIp(text) ? undefined : mismatch;
    case "cidr":
      return isCidr(text) ? undefined : mismatch;
    case "url":
      return isUrl(text) ? undefined : mismatch;
    case "integer":
      return INTEGER.test(text) ? undefined : mismatch;
    case "enum":
      return param.values?.includes(text) ? undefined : mismatch;
    case "token":
      return TOKEN.test(text) ? undefined : mismatch;
    default:
      return mismatch;
  }
};
