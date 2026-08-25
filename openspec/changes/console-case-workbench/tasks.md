> Recorded after implementation: this change was built on `feat/ui-design-system`
> and the tasks below are checked to reflect what is in the tree. Follow-ups
> identified along the way are recorded in `design.md` — Risks, not here, because
> each needs its own proposal.

## 1. Design system package

- [x] 1.1 Add `packages/ui` (`@viokit/ui`) to the workspace — source-first, no build step, CSS and React entry points
- [x] 1.2 Port the design tokens from the Claude Design project: colour, typography, spacing, radii/shadows, motion, dark theme
- [x] 1.3 Namespace every class, custom property and animation to `vk-` / `--vk-`
- [x] 1.4 Declare the cascade layer order and wrap every rule in `vk.tokens` / `vk.base` / `vk.components` / `vk.utilities`
- [x] 1.5 Split the kit's single stylesheet into one file per component, plus a tokens-only entry point
- [x] 1.6 Tokenise the console density rail (rail, bar, pane header, row, control and field heights; cell padding)
- [x] 1.7 Add the base layer: minimal reset, typographic utilities, opt-in viewport lock, reduced-motion handling

## 2. Design system components

- [x] 2.1 Port the icon set as JSX rather than injected markup, with a literal-union glyph name
- [x] 2.2 Build the chrome components: app shell, rail, top bar, status line, pane, pane stack, workspace
- [x] 2.3 Build the controls: button tones, icon button, link button, filter chip, toolbar
- [x] 2.4 Build the data components: data grid, state stripe, meter, progress, confidence, corroboration
- [x] 2.5 Build the surfaces: dialog, tray, job item, blank slate, field list, evidence block, log, canvas, scrubber, legend
- [x] 2.6 Port `TextField` off inline styles so focus, disabled and invalid are CSS state rules
- [x] 2.7 Add the accessibility the kit lacked: accessible names for glyph-only controls, `aria-pressed` on toggles, field-to-hint wiring, focus-revealed row actions, keyboard-dismissable dialog
- [x] 2.8 Add the theme hook and pre-paint theme application, with an app-selectable default
- [x] 2.9 Write the static preview page — the full workbench in hand-written HTML, to prove the system is really CSS
- [x] 2.10 Write render tests asserting the classes and ARIA each component emits
- [x] 2.11 Write the package README: usage, layering, theming, density, and what changed on import

## 3. Console on the design system

- [x] 3.1 Depend on `@viokit/ui` and import its stylesheet
- [x] 3.2 Rebuild the app shell: rail, command bar, docked panes
- [x] 3.3 Move the catalog onto the data grid with filter chips and blank slates
- [x] 3.4 Move the evidence form, case bar, launcher and graph queries onto design-system controls
- [x] 3.5 Reduce `styles.css` to app-level glue, guarding element defaults against design-system classes
- [x] 3.6 Make the console dark by default without a light flash on first paint
- [x] 3.7 Widen the lint override to cover the new React sources; keep the package out of the backend typecheck and chain its own

## 4. Case workbench

- [x] 4.1 Add the seed model: a typed value as canvas state, superseded once the graph asserts it
- [x] 4.2 Add transform-to-node matching by name equality, with single-input near misses offered for confirmation
- [x] 4.3 Read every published transform's contract on load and derive its form shape
- [x] 4.4 Build the canvas: nodes, edges, selection, and the seed drawn as unevidenced
- [x] 4.5 Build the expand panel: available transforms, pre-filled and editable form, staged steps, explicit commit
- [x] 4.6 Report what a commit actually added, distinguishing "nothing new" from a step count
- [x] 4.7 Add the case view to the rail, its selection to view state, and make it the default surface
- [x] 4.8 Test the matching, seeding and realisation rules

## 5. Case legibility

- [x] 5.1 Derive the case table from `replay` + `log`: sources, corroboration, first appearance, degree
- [x] 5.2 Add the curation model — keep, defer, discard, undo — and prune judgements about entities a case does not hold
- [x] 5.3 Persist curation and the case selection in view state; bump the payload version and validate the new shape
- [x] 5.4 Add the case overview: totals, review progress, and breakdown by kind and by source
- [x] 5.5 Add a categorical palette, colour canvas nodes by kind, and add a legend
- [x] 5.6 Reflect curation on the canvas and label nodes by identifier value
- [x] 5.7 Flag what arrived in the most recent expansion
- [x] 5.8 Test the derivation, curation and summary rules

## 6. Table states and derived columns

- [x] 6.1 Add `@tanstack/react-table` v9 to the console only, and build the table against the v9 `useTable` / `tableFeatures` API
- [x] 6.2 Add sortable headers as buttons inside the header cell, with `aria-sort` on the cell
- [x] 6.3 Add the three table states: everything, one entity kind, relations — falling back when a kind leaves the case
- [x] 6.4 Derive per-kind columns from the identifiers those entities carry, reporting further values rather than dropping them
- [x] 6.5 Detect imagery from the value's shape and offer a gallery when a column holds only images
- [x] 6.6 Build the relations table with endpoints resolved to their display values, muted when an end is discarded
- [x] 6.7 Test column derivation, image detection, relation rows and mode switching

## 7. Verification

- [x] 7.1 Typecheck both packages, lint the workspace, and build the console
- [x] 7.2 Verify the layer order survives bundling in the built stylesheet
- [x] 7.3 Drive the seed → expand → commit loop against a running engine and confirm the operation shapes
- [x] 7.4 Run the case derivation against the live engine's `replay` and `log`
