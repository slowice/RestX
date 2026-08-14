## ADDED Requirements

### Requirement: Accept safe heterogeneous Markdown skills
The system SHALL accept a selected regular Markdown file without requiring an exact filename or RestX Frontmatter, and SHALL reject empty, oversized, symbolic-link, or binary-like sources before analysis or persistence.

#### Scenario: Select an external Markdown skill
- **WHEN** the user selects a bounded textual Markdown file with a non-RestX structure
- **THEN** the system treats its normalized source content as the candidate executable prompt and continues the smart-import pipeline

#### Scenario: Reject an unsafe source
- **WHEN** the selected source is empty, oversized, a symbolic link, or contains binary-like content
- **THEN** the system creates no managed skill and returns a safe validation error

### Requirement: Directly import native RestX Skills
The system SHALL import an already valid RestX Skill through the existing direct path without sending its content to an AI Provider.

#### Scenario: Import a native RestX Skill
- **WHEN** the selected file passes strict RestX Skill parsing
- **THEN** the system creates a managed copy with a new local ID and reports analysis method `direct` without invoking AI

### Requirement: Use AI for metadata only
For a non-RestX Markdown source, the system SHALL allow the active AI Provider to propose only a bounded name, description, and detected format, and MUST derive the persisted executable prompt exclusively from the locally read source.

#### Scenario: AI metadata analysis succeeds
- **WHEN** the active Provider returns valid bounded metadata for a non-RestX skill
- **THEN** the system imports the source prompt unchanged except for CRLF-to-LF and surrounding-blank-line normalization and reports analysis method `ai`

#### Scenario: Source attempts prompt injection
- **WHEN** source content instructs the analyzer to rewrite instructions or emit additional fields
- **THEN** the system ignores model fields outside the metadata contract and persists no model-generated executable content

### Requirement: Fall back without blocking import
The system SHALL derive metadata locally and complete the import when AI is unconfigured, unavailable, times out, returns an error, or returns invalid metadata.

#### Scenario: Provider analysis fails
- **WHEN** a safe non-RestX Markdown source cannot be analyzed successfully by AI
- **THEN** the system chooses a bounded name from Frontmatter, H1, or filename, uses safe existing description metadata when available, imports the preserved prompt, and reports analysis method `fallback` with a safe warning

### Requirement: Explain smart-import behavior
The renderer SHALL identify the action as smart import, disclose that non-RestX source content may be sent to the active Provider, and distinguish direct, AI, and fallback completion outcomes without exposing source content, paths, Provider details, or raw model output.

#### Scenario: Display an AI result
- **WHEN** an import completes with AI metadata
- **THEN** the page identifies the detected format and imported skill name

#### Scenario: Display a fallback result
- **WHEN** an import completes through local fallback
- **THEN** the page explains that intelligent analysis failed, confirms that the original content was imported, and points the user to edit name or description if needed

### Requirement: Prevent duplicate smart imports
The system SHALL allow only one import operation at a time within the frequent-skills feature.

#### Scenario: Import already in progress
- **WHEN** another import request arrives before the current import completes
- **THEN** the system rejects the overlapping request without creating a duplicate skill
