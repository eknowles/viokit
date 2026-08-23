## MODIFIED Requirements

### Requirement: The catalog reports what this deployment can do
The runtime catalog SHALL report every source registered by every pack the deployment registers,
whether or not that source can be acquired here, so a caller learns a source exists and what reaching
it would need rather than finding it missing.

#### Scenario: Sources from every registered pack are listed
- **WHEN** a deployment registers its packs and the catalog is listed
- **THEN** every source those packs register appears

#### Scenario: A source that cannot be acquired here is still reported
- **WHEN** a registered source needs a transport or credential this deployment lacks
- **THEN** it appears in the listing, marked as not runnable, with the reason
