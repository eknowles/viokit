# @viokit/vocabulary

The one list of entity kinds and relation types that packs may use. Core holds no domain types
(open-domain rule), so this is a package of its own, and enforcement is a check, not a schema:
`bun run conformance` fails any pack that uses a name not listed here.

## Rules

- **Use what exists.** A tool's projection uses these names. `domain` covers every DNS name; the
  relation carries the role (`delegated-to`, `serves-mail-for`, `has-subdomain`).
- **Need a new name?** Do not add it. Ask for it: open a change named `vocabulary-<name>` that
  adds only the entry and its description, and keep your tool working against a stub until it lands.
- **Only a steward change edits this package.** The held-out guard fails any other change that
  modifies it. The orchestrator passes the steward flag only for changes named `vocabulary-*`.
- **Names are lower-case and hyphenated, with a description.** A test enforces it.

Names were informed by SpiderFoot's event types (MIT, copyright Steve Micallef). BBOT is AGPL-3.0;
nothing here is taken from its code.
