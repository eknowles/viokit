## ADDED Requirements

### Requirement: A browser acquisition runs in a process dedicated to its route
Where a browser's route is fixed when its process starts, the system SHALL run each browser
acquisition in a process started for the route the runtime resolved, so the route cannot be inherited
from an earlier acquisition (I10).

#### Scenario: A proxied browser acquisition is routed through its proxy
- **WHEN** a browser acquisition resolves to a proxied route
- **THEN** its traffic leaves by that proxy

#### Scenario: A second acquisition on a different route is not given the first one's
- **WHEN** a browser acquisition on one route follows an acquisition on another
- **THEN** it leaves by its own route, not the earlier one

#### Scenario: A route is reused rather than rebuilt
- **WHEN** two acquisitions resolve to the same route and identity
- **THEN** they use the same browser process

### Requirement: Acquisitions that would cross routes do not overlap
Where concurrent browser work cannot be bound to separate routes, the system SHALL admit only one
route's acquisitions at a time, and SHALL release that hold when an acquisition fails or is
interrupted as well as when it succeeds.

#### Scenario: Different routes are serialized
- **WHEN** two browser acquisitions on different routes are requested at once
- **THEN** the second begins only after the first has finished

#### Scenario: One route is not serialized against itself
- **WHEN** two browser acquisitions on the same route are requested at once
- **THEN** both may proceed together

#### Scenario: A failed acquisition does not block later ones
- **WHEN** a browser acquisition fails or is interrupted while holding the route
- **THEN** a later acquisition on any route still proceeds

### Requirement: A browser that never becomes ready fails the acquisition
The system SHALL bound how long it waits for a browser process to become usable, and SHALL fail the
acquisition with that reason rather than waiting indefinitely.

#### Scenario: An unusable browser is reported, not awaited
- **WHEN** a browser process is started for a route and never becomes usable
- **THEN** the acquisition fails, naming the reason

## MODIFIED Requirements

### Requirement: Browser identities do not share sessions
Where acquisitions run under different identities, their browser sessions SHALL be isolated, so
cookies and stored credentials from one identity are never presented under another (TDR-011). A
session SHALL additionally be isolated per egress route, so a session established over one route is
not presented over another.

#### Scenario: Two identities do not share cookies
- **WHEN** two acquisitions run under different identities
- **THEN** neither session can read the other's cookies or storage

#### Scenario: One identity keeps its session across acquisitions on one route
- **WHEN** two acquisitions run under the same identity and the same route
- **THEN** they share a session, so a login obtained once is still present

#### Scenario: A session does not follow an identity across routes
- **WHEN** the same identity acquires over two different routes
- **THEN** the two acquisitions use separate sessions
