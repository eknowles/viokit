## ADDED Requirements

### Requirement: Provenance names what produced a claim
Where a step records what produced it, the console SHALL show that alongside the evidence — the
transform that ran and the versioned source it acquired from — so an investigator can see not only
what a claim rests on but what derived it.

#### Scenario: A derived step names its transform and source
- **WHEN** provenance is shown for a step produced by a transform
- **THEN** the transform and the versioned source are shown

#### Scenario: A step without attribution does not invent one
- **WHEN** provenance is shown for a step that records no source
- **THEN** no transform or source is claimed for it
