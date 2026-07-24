# Assisted problem classification specification

## ADDED Requirements

### Requirement: AI classification is explicit and provider-backed

RestX SHALL classify only the currently selected problem after explicit user action and SHALL use the active RestX AI Provider without creating feature-owned credentials.

#### Scenario: Active Provider is available

- **WHEN** the user requests organization for a pending problem
- **THEN** RestX sends one bounded problem and the existing label vocabulary to the active Provider
- **AND** validates a structured suggestion containing one scene and non-empty capability and knowledge lists

#### Scenario: No active Provider is available

- **WHEN** the user requests organization without a ready active Provider
- **THEN** RestX keeps the problem unchanged
- **AND** guides the user to Provider settings

#### Scenario: Provider output is invalid

- **WHEN** the model returns malformed or out-of-bounds labels
- **THEN** RestX rejects the suggestion and reports an actionable error
- **AND** does not modify the Markdown

### Requirement: Existing vocabulary is preferred and new labels are visible

RestX SHALL normalize model suggestions against existing scene, capability, and knowledge labels before displaying an editable confirmation.

#### Scenario: Suggested label matches existing vocabulary

- **WHEN** a suggestion differs from an existing label only by case or surrounding whitespace
- **THEN** RestX reuses the existing canonical display label
- **AND** marks it as existing in the confirmation UI

#### Scenario: Suggested label is new

- **WHEN** no normalized existing label matches a valid suggestion
- **THEN** RestX marks the label as new
- **AND** requires the same explicit confirmation as all other changes

### Requirement: Confirmed classification is written safely

RestX SHALL update only managed classification fields after explicit confirmation and SHALL protect the source through fingerprint checks, backup, and atomic replacement.

#### Scenario: User confirms an unchanged source

- **WHEN** the current file fingerprint matches the classification suggestion
- **THEN** RestX backs up the original under `.restx-backup`
- **AND** updates the managed Frontmatter while preserving unknown metadata and Markdown body
- **AND** refreshes the graph from the new source state

#### Scenario: Source changes before confirmation

- **WHEN** the Markdown content no longer matches the suggestion fingerprint
- **THEN** RestX rejects the write as a conflict
- **AND** leaves both the current source and graph unchanged

#### Scenario: Writeback fails

- **WHEN** backup creation or atomic replacement fails
- **THEN** RestX reports the failure without logging Markdown content
- **AND** does not report the problem as organized
