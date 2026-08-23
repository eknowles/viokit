## MODIFIED Requirements

### Requirement: Acquisition path recorded
Every `Evidence` record SHALL record an `AcquisitionPath` indicating how it was acquired
(`live` / `cache` / `proxy` / `manual`). A `manual` path SHALL record who retrieved the artifact,
so evidence a person gathered is as attributable as evidence the pipeline fetched.

#### Scenario: Evidence carries its acquisition path
- **WHEN** evidence is produced by the pipeline
- **THEN** its record includes a non-empty `AcquisitionPath` value

#### Scenario: Manually acquired evidence names its retriever
- **WHEN** evidence is recorded as manually acquired
- **THEN** its acquisition path identifies the person or agent that retrieved it, and may record where it came from

#### Scenario: Manual acquisition without a retriever is rejected
- **WHEN** evidence is submitted as manually acquired with no retriever recorded
- **THEN** it is rejected at the boundary and nothing is stored (I6)

## ADDED Requirements

### Requirement: Sources carry an access classification
A source specification SHALL carry how the source is reached — an open API, a dataset, a browser-only
interface, or one requiring credentials — drawn from the same vocabulary the discovery harness uses to
classify candidates, so the classification survives promotion rather than being discarded. A source
whose classification is unknown SHALL say so explicitly rather than defaulting to a reachable kind.

#### Scenario: A promoted source keeps its classification
- **WHEN** a candidate classified as browser-only is promoted into a source specification
- **THEN** that specification records the browser-only classification

#### Scenario: An unclassified source is explicit about it
- **WHEN** a source specification is created without an access classification
- **THEN** its classification reads as unknown, not as an open API
