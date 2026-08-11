#!/usr/bin/env bun
/**
 * Extract the entries of a curated OSINT list (a GitHub-style awesome markdown
 * README) into a compact JSON array the agent can judge quickly.
 *
 * Usage:
 *   bun mine-list.ts <raw-markdown-url-or-file> [--min-description]
 *
 * Output (stdout): JSON array of { section, name, url, desc } sorted by section.
 * Only list-item links of the form `- [Name](url)` are kept; prose, tables,
 * and nested bullets are flattened to the section they appear under.
 */
import { readFile } from "node:fs/promises";

interface Entry {
  desc: string;
  name: string;
  section: string;
  url: string;
}

const ITEM_LINK =
  /^\s*[*+-]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:\s*-\s*(.*))?$/;
const HEADING = /^#{1,3}\s/;
const TOC_ANCHOR = /\[↑\]\([^)]*\)/;
const HTTP_URL = /^https?:\/\//;

const main = async (): Promise<void> => {
  const [, , target] = process.argv;
  if (!target) {
    console.error("usage: bun mine-list.ts <raw-md-url|file>");
    process.exit(1);
  }
  const source: string = HTTP_URL.test(target)
    ? await (await fetch(target)).text()
    : await readFile(target, "utf8");

  const entries: Entry[] = [];
  let section = "(unsorted)";
  for (const line of source.split("\n")) {
    if (HEADING.test(line)) {
      section = line.replace(HEADING, "").replace(TOC_ANCHOR, "").trim();
      continue;
    }
    const match = line.match(ITEM_LINK);
    if (match) {
      const [, name, url, desc] = match;
      entries.push({
        desc: (desc ?? "").trim(),
        name: name.trim(),
        section,
        url,
      });
    }
  }

  console.log(JSON.stringify(entries, null, 2));
};

await main();
