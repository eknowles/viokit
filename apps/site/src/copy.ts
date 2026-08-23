// =====================================================================
// Viokit — all marketing copy
// =====================================================================
// Single source of truth for every user-facing string on the site.
// Edit text here in one place; the components import from this file.
//
// Each block is labelled with WHERE it renders (component + area) so you
// can find exactly what you're editing. Keep object keys in alphabetical
// order (the repo's Biome config enforces this via `useSortedKeys`).
// =====================================================================

// ---------------------------------------------------------------------
// site — global identity.
// Used on every page: <title>, <head> meta, brand mark, contact links.
// `tagline` doubles as the suffix of the homepage <title>.
// ---------------------------------------------------------------------
export const site = {
  description:
    "Viokit gathers evidence from any source — the open web, your internal systems, or connectors built on our SDK — verifies every claim against its origin, and assembles a living picture of people, companies, places, and events. For human analysts and AI agents alike.",
  email: "early-access@viokit.com",
  name: "Viokit",
  tagline: "Intelligence from any source, engineered for trust",
  url: "https://viokit.com",
};

export interface NavLink {
  href: string;
  label: string;
}

// ---------------------------------------------------------------------
// nav — sticky top navigation bar (src/components/Nav.astro).
// `links` are the anchor links; `cta` is the highlighted button.
// ---------------------------------------------------------------------
export const nav = {
  ariaLabel: "Primary",
  cta: { href: "#access", label: "Request early access" },
  links: [
    { href: "#capabilities", label: "Capabilities" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#use-cases", label: "Who it's for" },
  ] satisfies NavLink[],
};

export interface Stat {
  label: string;
  num: string;
}

// ---------------------------------------------------------------------
// hero — top of the homepage (src/components/Hero.astro).
// `headingA`/`headingB` form the two-line headline (B is highlighted in
// accent colour). `stats` is the three-column strip below the fold.
// ---------------------------------------------------------------------
export const hero = {
  ctaPrimary: { href: "#access", label: "Request early access" },
  ctaSecondary: { href: "#capabilities", label: "See what it can do" },
  eyebrow: "The investigation platform for any evidence",
  headingA: "Investigate everything.",
  headingB: "Trust what you find.",
  note: "Built for human analysts and AI agents alike.",
  stats: [
    {
      label:
        "core investigation patterns — the moves every OSINT practitioner already knows",
      num: "10",
    },
    {
      label:
        "source domains covered, from corporate registries to transport and beyond",
      num: "24+",
    },
    {
      label: "of findings link back to the original artifact — no black boxes",
      num: "100%",
    },
  ] satisfies Stat[],
  sub: "Gather evidence from the open web and your own systems. Verify every claim against its source. See the connections between people, companies, places, and events — all in one place, all backed by provenance you can inspect.",
};

// ---------------------------------------------------------------------
// graph — the hero illustration (src/components/GraphHero.astro).
// `sources` are the service nodes that fan out from the subject.
// Each has a label and an icon key matching the SVG paths in the component.
// ---------------------------------------------------------------------
export interface GraphSource {
  icon: string;
  label: string;
}

export const graph = {
  ariaLabel:
    "An investigation graph: a subject in the centre fans out to multiple data sources — company registries, corporate records, social media, threat intelligence, and code platforms — each returning evidence that cross-references back.",
  corroborationBadge: "×2",
  legend: ["subject", "source", "evidence"],
  sources: [
    { icon: "building", label: "Companies House" },
    { icon: "briefcase", label: "OpenCorporates" },
    { icon: "bird", label: "Twitter / X" },
    { icon: "linkedin", label: "LinkedIn" },
    { icon: "terminal", label: "Shodan" },
    { icon: "code", label: "GitHub" },
    { icon: "plane", label: "FlightRadar" },
  ] satisfies GraphSource[],
  status: "querying 7 sources · streaming results · corroborating matches",
  subjectLabel: "subject",
  timeAxisLabel: "TIME",
};

// ---------------------------------------------------------------------
// capabilities — the "what it can do" grid (src/components/Capabilities.astro).
// `icon` is the key for the SVG in the component; `tag` is the small
// mono label at the bottom of each card.
// ---------------------------------------------------------------------
export interface Capability {
  body: string;
  icon: string;
  tag: string;
  title: string;
}

export const capabilities: Capability[] = [
  {
    body: "Every finding links back to the raw artifact it came from. Nothing is edited, dropped, or fabricated — what you see is what was actually found.",
    icon: "shield",
    tag: "// immutable evidence",
    title: "Evidence that can't be quietly rewritten",
  },
  {
    body: "Each claim records which source produced it, when, through what route, and with what confidence. Live, archived, or previously gathered — the trail always says where a fact came from.",
    icon: "trail",
    tag: "// full provenance",
    title: "Every fact carries its paper trail",
  },
  {
    body: "People, companies, places, and events — how they connect, where they were, and when it happened. The graph, the timeline, and the map move together as one picture.",
    icon: "globe",
    tag: "// temporal investigation graph",
    title: "See the story in four dimensions",
  },
  {
    body: "Any investigation can be rebuilt step by step, exactly as it unfolded. Hand it to a colleague, an auditor, or a court — nothing is lost and nothing is hidden.",
    icon: "replay",
    tag: "// reproducible cases",
    title: "Cases you can replay, not just review",
  },
  {
    body: "AI agents plan and run multi-step investigations on the same rails and under the same guardrails as human analysts. No shortcuts, no hidden steps, no privileged back doors.",
    icon: "robot",
    tag: "// human & agent parity",
    title: "Agents that play by the same rules",
  },
  {
    body: "Open web, internal databases, case management systems, proprietary feeds — build a connector once with our SDK and it plugs straight into evidence capture, provenance, and every view. No special-casing your data, no rebuilding the platform.",
    icon: "extend",
    tag: "// SDK & custom connectors",
    title: "Bring your own sources",
  },
  {
    body: "When a subject returns hundreds or thousands of hits, filter, rank, keep, or discard before anything reaches your case — across table, map, timeline, and graph at once.",
    icon: "filter",
    tag: "// results workbench",
    title: "Triage the firehose",
  },
  {
    body: "Access control, redaction, retention, and a full audit trail are built in. Sensitive findings stay controlled — in the case, in the archive, and in every export.",
    icon: "lock",
    tag: "// governance built-in",
    title: "Governance from the first case",
  },
];

export const capabilitiesSection = {
  heading: "What Viokit can do",
  lead: "Viokit turns scattered sources — open or your own — into a single, verifiable record. These are the things that matter when your conclusions have to hold up.",
};

// ---------------------------------------------------------------------
// liveCase — the illustrative case log (src/components/EvidenceTrail.astro).
// `panelTitle` is the header of the log panel; `entries` are the rows.
// `verified` marks a row that shows the "corroborated" badge.
// ---------------------------------------------------------------------
export interface TrailEntry {
  body: string;
  meta: string;
  time: string;
  verified?: boolean;
}

export const liveCase = {
  caption:
    "Illustrative case log. Every entry links to the artifact it came from.",
  entries: [
    {
      body: "Company registration retrieved",
      meta: "company registry · filing #0412578",
      time: "09:41",
    },
    {
      body: "Director matched to a person record",
      meta: "appointment record",
      time: "09:52",
    },
    {
      body: "Domain ownership resolved",
      meta: "whois · registrar transfer 2024-08",
      time: "09:58",
    },
    {
      body: "Street imagery geolocated",
      meta: "photo evidence · 51.5074° N, 0.1278° W",
      time: "10:03",
    },
    {
      body: "Flight history correlated",
      meta: "transport records · timeline window updated",
      time: "10:17",
      verified: true,
    },
    {
      body: "Credential flagged in a breach archive",
      meta: "leak dataset · needs review before export",
      time: "10:28",
    },
  ] satisfies TrailEntry[],
  eyebrow: "A case in progress",
  heading: "Watch an investigation assemble itself.",
  lead: "No copy-pasting between tabs. No losing track of which lead came from where. Every move lands on the case log — with its source and its confidence attached.",
  panelTitle: "investigation — opening a company · live",
  verifiedLabel: "✓ independently corroborated",
};

// ---------------------------------------------------------------------
// howItWorks — the three-step narrative (src/components/HowItWorks.astro).
// ---------------------------------------------------------------------
export interface Step {
  body: string;
  title: string;
}

export const howItWorks = {
  heading: "How it works",
  lead: "Three moves. You stay in control; the platform keeps the books.",
  steps: [
    {
      body: "A name, company, username, photo, address, plate, coordinate, or document. No setup, no schemas to design — just start.",
      title: "Start from anything",
    },
    {
      body: "The platform fans out to the sources that matter for your subject — the open web, registries, maps, transport, archives, and any internal source connected through our SDK. Results stream back as they arrive.",
      title: "Gather from everywhere relevant",
    },
    {
      body: "Keep what's corroborated, discard the noise. The platform assembles the evidence, the connections, and the timeline — and records every step you took so you can defend it later.",
      title: "Verify, curate, reason",
    },
  ] satisfies Step[],
};

// ---------------------------------------------------------------------
// useCases — the "who it's for" grid (src/components/UseCases.astro).
// ---------------------------------------------------------------------
export interface UseCase {
  body: string;
  title: string;
}

export const useCases: UseCase[] = [
  {
    body: "Your entire OSINT workflow in one place — every lead documented, every source attributed.",
    title: "OSINT & investigations",
  },
  {
    body: "Verifiable sourcing and a reproducible fact trail, so the story holds up to scrutiny.",
    title: "Investigative journalism",
  },
  {
    body: "Ownership, officers, connections across registries — and an audit trail showing how you found them.",
    title: "Due diligence & corporate research",
  },
  {
    body: "Connect identities, accounts, and assets across independent sources into one view.",
    title: "Fraud & financial crime",
  },
  {
    body: "Infrastructure, actors, and activity correlated into a clear, timestamped picture.",
    title: "Threat intelligence",
  },
  {
    body: "Document events and movement with evidence that withstands challenge.",
    title: "Human rights & accountability",
  },
  {
    body: "Start cases with an evidentiary trail that is complete, auditable, and exportable from day one.",
    title: "Regulators & auditors",
  },
  {
    body: "Agents pursue leads under the same guardrails as your analysts — and you can audit every step they took.",
    title: "AI & agentic research",
  },
  {
    body: "Connect internal databases, case files, and proprietary feeds with our SDK — same evidence trail and guardrails as the open web.",
    title: "Enterprises & internal intelligence teams",
  },
];

export const useCasesSection = {
  heading: "Who Viokit is for",
  lead: "If you gather evidence — open source or your own — and answer for what you find, this is for you.",
};

// ---------------------------------------------------------------------
// access — the early-access section (src/components/Access.astro).
// `perks` are the bullet points beside the form.
// ---------------------------------------------------------------------
export const access = {
  body: "We're building the platform now and looking for teams and investigators who want a seat at the table. Leave your details and we'll reach out when access opens.",
  heading: "Get early access",
  perks: [
    "Early access as soon as it's available",
    "A say in which sources matter most to you",
    "No spam — only updates worth reading",
  ],
};

// ---------------------------------------------------------------------
// form — the interest-capture form (src/components/InterestForm.astro).
// `labels`/`placeholders`/`errors` map to the three inputs by field name.
// `messages` are the success/error banners; `note` is the privacy line.
// ---------------------------------------------------------------------
export const form = {
  button: "Request early access",
  buttonSending: "Sending…",
  errors: {
    emailInvalid: "That email address doesn't look right.",
    emailRequired: "Please add your work email.",
    nameRequired: "Please tell us your name.",
  },
  labels: {
    company: "Company",
    email: "Work email",
    name: "Full name",
  },
  messages: {
    failure:
      "Something went wrong sending your request. Try again, or email us directly.",
    invalid: "A couple of details need fixing before we can take your request.",
    success: "Thanks — your interest is registered. We'll be in touch.",
  },
  note: "No spam. We'll only use your details to follow up about Viokit.",
  placeholders: {
    company: "Acme Intelligence",
    email: "ada@company.com",
    name: "Ada Lovelace",
  },
};

// ---------------------------------------------------------------------
// footer — the site footer (src/components/Footer.astro).
// `explore` reuses the nav destinations; `contact` includes the privacy
// page and a mailto link built from `site.email`.
// ---------------------------------------------------------------------
export const footer = {
  bottomTagline: "Built for human analysts and AI agents alike.",
  contact: {
    heading: "Contact",
    links: [
      { href: `mailto:${site.email}`, label: site.email },
      { href: "/privacy", label: "Privacy policy" },
    ] satisfies NavLink[],
  },
  explore: {
    heading: "Explore",
    links: [
      { href: "#capabilities", label: "Capabilities" },
      { href: "#how-it-works", label: "How it works" },
      { href: "#use-cases", label: "Who it's for" },
      { href: "#access", label: "Request early access" },
    ] satisfies NavLink[],
  },
  rights: "All rights reserved.",
  tagline:
    "Intelligence from any source, engineered for trust. Every finding sourced, every case replayable, every export defensible.",
};

// ---------------------------------------------------------------------
// privacy — the privacy policy page (src/pages/privacy.astro).
// Section bodies may contain the `{email}` token, which the page replaces
// with a mailto link to `site.email`.
// ---------------------------------------------------------------------
export interface PrivacySection {
  body?: string;
  heading: string;
  list?: string[];
  reply?: string;
}

export const privacy = {
  sections: [
    {
      body: "When you request early access, we collect the details you choose to share with us: your name, your company, and your work email address. That's it.",
      heading: "What we collect",
    },
    {
      body: "We use these details for one purpose: to keep you informed about Viokit and to follow up about early access. We do not sell your data, and we do not use it for anything else.",
      heading: "Why we collect it",
    },
    {
      body: "Your details are stored securely and only accessible to the people who need them to run early access. We keep them for as long as we're actively working with you — and no longer than needed.",
      heading: "How we store it",
    },
    {
      body: "You can ask us at any time to:",
      heading: "Your rights",
      list: [
        "tell you what we hold about you",
        "correct anything that's wrong",
        "delete your details entirely",
      ],
      reply: "Just email {email}.",
    },
    {
      body: "Questions about this policy? Reach us at {email}.",
      heading: "Contact",
    },
  ] satisfies PrivacySection[],
  title: "Privacy policy",
  updated: "Last updated: August 2026",
};
