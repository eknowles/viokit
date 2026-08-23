## ADDED Requirements

### Requirement: Manually acquired evidence is stored like any other
The evidence store SHALL store manually acquired artifacts under the same content-addressed,
write-once rules as pipeline-acquired artifacts, preserving the human provenance recorded on them.

#### Scenario: Manual provenance survives storage
- **WHEN** manually acquired evidence is stored and read back
- **THEN** its acquisition path still identifies the retriever and origin

#### Scenario: Identical manual artifacts collapse to one record
- **WHEN** the same bytes are submitted twice as manually acquired
- **THEN** the store holds one record, because identity is the content hash (I1)
