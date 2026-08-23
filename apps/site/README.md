# Viokit — Marketing Site

A marketing website for **Viokit**, an open-source intelligence (OSINT) platform. The site
communicates product capabilities at a high level (immutable evidence, provenance, temporal
investigation graph, AI-agent parity, governance) without revealing how the platform is built.

Built with [Astro](https://astro.build). Static output, no server required.

## Project structure

```text
/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Access.astro        # early-access section (form + copy)
│   │   ├── Capabilities.astro  # capability cards
│   │   ├── EvidenceTrail.astro # illustrative "live case" log
│   │   ├── Footer.astro
│   │   ├── GraphHero.astro     # hero investigation-graph visual
│   │   ├── Hero.astro
│   │   ├── HowItWorks.astro    # 3-step narrative
│   │   ├── InterestForm.astro  # name / company / email capture
│   │   ├── Logo.astro
│   │   ├── Nav.astro
│   │   └── UseCases.astro
│   ├── layouts/BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   └── privacy.astro
│   ├── config.ts               # site metadata + form endpoint
│   └── styles/global.css
└── astro.config.mjs
```

## Commands

The site is a workspace package of the root `labs` monorepo (Bun). Run it from the site directory,
or from the root with `bun run --filter viokit-site <script>` (root also has `dev`, `build`,
`preview`, and `astro:check` aliases).

| Command               | Action                                        |
| :-------------------- | :-------------------------------------------- |
| `bun install`         | Install dependencies (from the root)          |
| `bun run dev`         | Start local dev server at `localhost:4321`    |
| `bun run build`       | Build the production site to `./dist/`        |
| `bun run preview`     | Preview the production build locally          |
| `bun run astro check` | Type-check the project                        |

To move the site out of the monorepo later: copy the directory, remove it from the root
`workspaces` array, and run `bun install` again.

## Connecting the interest form

Submissions are sent as `POST` JSON to the endpoint in `src/config.ts`:

```ts
export const INTEREST_FORM_ENDPOINT = 'https://formspree.io/f/<your-form-id>';
```

With an empty endpoint the form runs in **demo mode** (submissions are simulated and nothing is
sent anywhere). Point it at any endpoint that accepts JSON to go live. Payload shape:

```json
{ "name": "...", "company": "...", "email": "..." }
```
