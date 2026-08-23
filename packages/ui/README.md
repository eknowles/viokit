# @viokit/ui

The Viokit design system, imported from the Claude Design project
[Viokit Design System](https://claude.ai/design/p/daa0dad8-0158-4e0f-b857-662670e6f00c)
(`ui_kits/investigation-workbench`).

**The system is the CSS.** `css/` is plain, buildable-by-nobody stylesheets:
custom properties for the tokens, one file per component, no preprocessor and
no CSS-in-JS. `src/` is a thin React layer whose only job is to emit those class
names with types attached. Nothing injects styles at runtime, so the same system
works from React, plain HTML, Astro, or a server-rendered template.

`preview/workbench.html` is the proof: the full analyst workbench, hand-written
HTML, no JavaScript beyond a three-line theme toggle. Open it directly in a
browser.

## Use it

```ts
// once, at the app entry
import "@viokit/ui/css";
```

```tsx
import { AppShell, Pane, Rail, TopBar, Workspace } from "@viokit/ui";

<AppShell rail={<Rail items={VIEWS} onChange={setView} value={view} />}>
  <TopBar actions={<ThemeToggle />} title="viokit" />
  <Workspace wide>
    <Pane title="source catalog">{…}</Pane>
  </Workspace>
</AppShell>;
```

Give the shell a viewport to fill: `class="vk-viewport"` on `<html>` and
`.vk-fill` on the mount node.

Tokens without components:

```ts
import "@viokit/ui/css/tokens";
```

Or one component at a time, e.g. `@viokit/ui/css/components/data-grid.css`.

## Cascade layers

Everything ships inside `@layer vk.tokens, vk.base, vk.components, vk.utilities`.
Later layers win, and **anything a consuming app writes outside a layer beats
all four** — so overriding a library rule never needs `!important` or a doubled
selector.

The flip side is the one thing to watch for: an unlayered `button {}` rule in an
app also outranks `.vk-btn`. `apps/console/src/styles.css` shows the fix —
guard app-level element defaults with `:not([class*="vk-"])`.

## Theming

Light is the default. Dark is `<html data-theme="dark">`, or the class
`.vk-theme-dark` on any subtree — the tokens are inherited, so a single dark
pane inside a light app is just a nested `.vk-theme-dark`.

`useTheme()` wires the toggle and persists to `localStorage["vk-theme"]`;
`applyStoredTheme()` applies it before first paint so a dark reload does not
flash light.

Console components read **only** the `--vk-tool-*` tokens, never the raw
`--vk-slate-*` / `--vk-ink-*` ramps. The ramps do not flip between themes; the
tool tokens do, and they invert differently from the marketing surfaces (in dark
mode the filled button becomes light-on-dark, not dark-on-light).

## Density

Every fixed height in the console chrome is a token, not a magic number, so
density is tunable in one place:

| Element | Token | Value |
| :-- | :-- | :-- |
| Icon rail / command bar / pane header | `--vk-rail-w` / `--vk-topbar-h` / `--vk-pane-head-h` | 44 / 38 / 26px |
| Table row / header row | `--vk-row-h` / `--vk-row-head-h` | 28 / 24px |
| Button / field | `--vk-control-h` / `--vk-field-h` | 24 / 28px |
| Body / mono / micro | `--vk-console-text` / `--vk-console-mono` / `--vk-console-micro` | 13 / 11.5 / 9.5px |
| Cell padding | `--vk-cell-pad` | 12px inline, 0 block |
| Radius / elevation | `--vk-radius-console` / — | 0 / none |

Panes share 1px hairlines and never gaps. Only the dialog and the tray take
elevation. Numerics are right-aligned with tabular figures. The accent colour is
reserved for state — the selected row and the deferred stripe — never chrome.

## What changed on the way in

The kit's CSS was inlined in one `<style>` block with bare class names
(`.grid`, `.pane`, `.chip`) and inline-styled React. Ported verbatim, that would
have collided with the first app to define its own `.grid`. So:

- **Namespaced** every class and animation to `vk-`, and every token to `--vk-`.
- **Layered** the whole system, so app styles win by default.
- **Split** the one blob into `tokens/`, `base/` and one file per component.
- **Tokenised** the hard-coded density numbers listed above.
- **Moved `TextField` off inline styles.** Focus, disabled and invalid are CSS
  state rules now, so the browser applies them rather than React state.
- **Dropped `dangerouslySetInnerHTML` from `Icon`** — the glyphs are JSX.
- **Added the states a real library needs**: `:disabled` on every control, a
  `failed` job state, `prefers-reduced-motion`, `.vk-sr-only` names for the
  glyph-only rail, `aria-pressed` on toggles, and `aria-describedby` wiring
  between a field and its hint.
- **Made row actions reachable by keyboard.** The kit revealed them on
  `:hover` only; `:focus-within` now reveals them too.
- **Made the dialog dismissable properly**: a real click-away `<button>` instead
  of a click handler on a `<div>`, and Escape bound to the document so it works
  wherever focus is.

Colour, type, radii and motion values are unchanged from the design project.

## Tests

`test/render.test.tsx` renders each component to static markup and asserts the
classes and ARIA it emits. That is the contract — the styling is in CSS, so what
a component owes its caller is the right classes on the right elements.

```
bun run --filter @viokit/ui test
```
