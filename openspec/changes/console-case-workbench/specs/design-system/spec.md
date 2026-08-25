## Purpose

Gives every Viokit surface one visual system, delivered as stylesheets rather than as components, so
the same tokens and class contract are usable from React, plain HTML, or any other renderer, and a
consuming application can override any of it without fighting the library.

## ADDED Requirements

### Requirement: The system is delivered as CSS
The design system SHALL be usable by importing stylesheets alone. No rule SHALL depend on a component
having rendered it, and nothing SHALL be injected at runtime, so a surface written in plain HTML gets
the same result as one written in React.

#### Scenario: A surface built without the component library looks the same
- **WHEN** a page applies the system's class names to hand-written markup
- **THEN** it renders as the corresponding components do

#### Scenario: No styles are injected at runtime
- **WHEN** a component from the system renders
- **THEN** it emits class names only, and adds no stylesheet to the document

### Requirement: Tokens are separable from components
The system SHALL offer its design tokens as an entry point that carries no component rules and no
element resets, so an application can adopt the palette, type scale and density without adopting the
components.

#### Scenario: Tokens can be imported alone
- **WHEN** an application imports only the token entry point
- **THEN** the tokens are defined and no component or element is restyled

### Requirement: Library styles never outrank application styles
Every rule the system ships SHALL sit inside a cascade layer, so that a rule an application writes
outside a layer wins regardless of specificity. Overriding the system SHALL NOT require `!important`
or an artificially specific selector.

#### Scenario: An application rule wins without escalation
- **WHEN** an application defines a rule for an element the system also styles
- **THEN** the application's rule applies

#### Scenario: Layer order is deterministic
- **WHEN** the stylesheet is bundled by a build tool
- **THEN** tokens, base, components and utilities apply in that order

### Requirement: Class names are namespaced
Every class name, custom property and animation the system defines SHALL carry a common prefix, so
that adding the system to an application cannot silently restyle that application's own elements.

#### Scenario: A generic application class is unaffected
- **WHEN** an application defines a class whose unprefixed name matches a concept the system also styles
- **THEN** the application's class is unaffected by the system

### Requirement: Both themes ship, and the application picks the default
The system SHALL provide a light and a dark theme selectable per document or per subtree, and SHALL
let a consuming application choose which one applies when nothing has been remembered.

#### Scenario: A theme applies to a subtree
- **WHEN** a subtree is marked as the non-default theme
- **THEN** only that subtree re-themes, and the rest of the document is unchanged

#### Scenario: An application's default is honoured
- **WHEN** an application declares a default theme and no preference has been stored
- **THEN** that theme applies

#### Scenario: A stored preference beats the default
- **WHEN** a preference has been stored
- **THEN** it applies instead of the application's default

#### Scenario: An unavailable preference store does not break theming
- **WHEN** the preference cannot be read or written
- **THEN** the application's default applies and the theme remains switchable for the session

### Requirement: Interactive components are operable without a pointer
Every control the system provides SHALL be reachable and operable by keyboard, and SHALL carry an
accessible name where its visible content does not provide one. Affordances revealed on hover SHALL
also be revealed on focus.

#### Scenario: A glyph-only control is named
- **WHEN** a control renders as an icon with no visible text
- **THEN** it exposes an accessible name

#### Scenario: A hover-revealed action is reachable by keyboard
- **WHEN** a control is revealed on hover and the user reaches it by keyboard instead
- **THEN** it becomes visible

#### Scenario: A dismissible overlay can be dismissed without a pointer
- **WHEN** an overlay is open
- **THEN** it can be dismissed from the keyboard wherever focus is

### Requirement: Motion respects a reduced-motion preference
Where the environment reports a preference for reduced motion, the system SHALL suppress its
animations and transitions.

#### Scenario: Animation is suppressed
- **WHEN** the environment reports a preference for reduced motion
- **THEN** the system's animations and transitions do not play
