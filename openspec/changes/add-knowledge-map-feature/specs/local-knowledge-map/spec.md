# Local knowledge map specification

## ADDED Requirements

### Requirement: RestX scans the local knowledge root within strict boundaries

RestX SHALL create and recursively scan `~/.restx/knowledge/` for bounded regular Markdown files and SHALL exclude hidden directories, `.restx-backup`, symbolic links, unsupported files, and entries beyond configured resource limits.

#### Scenario: User opens the knowledge feature for the first time

- **WHEN** the knowledge root does not exist
- **THEN** RestX creates the directory with private permissions
- **AND** displays an empty-state action to open the directory

#### Scenario: Knowledge root contains archived subdirectories

- **WHEN** supported Markdown files exist in ordinary nested directories
- **THEN** RestX includes them in the scan using knowledge-root-relative identifiers

#### Scenario: Excluded content exists

- **WHEN** Markdown appears under `.restx-backup`, a hidden directory, or a symbolic-link target
- **THEN** RestX does not read or display that content

### Requirement: Markdown classification state is explicit

RestX SHALL classify each scanned Markdown file as pending, organized, or invalid without hiding unclassified problems.

#### Scenario: Markdown has no Frontmatter

- **WHEN** a bounded Markdown file has no YAML Frontmatter
- **THEN** RestX displays it in the pending area
- **AND** allows read-only preview and AI organization

#### Scenario: Markdown has complete classification

- **WHEN** `type` is `problem`, `scene` is a non-empty string, and `capability` and `knowledge` are non-empty string arrays
- **THEN** RestX marks the problem organized
- **AND** includes its labels in graph aggregation

#### Scenario: Markdown has malformed YAML

- **WHEN** the Frontmatter cannot be parsed
- **THEN** RestX marks the file invalid and reports the parse problem
- **AND** does not overwrite the file through AI organization

### Requirement: Confirmed labels form a layered virtual graph

RestX SHALL aggregate identical normalized labels into virtual scene, capability, and knowledge nodes and SHALL connect them to their source problem nodes in a scene-to-capability-to-knowledge-to-problem layered path.

#### Scenario: Multiple problems reuse a label

- **WHEN** two organized problems contain labels equal after whitespace and case normalization
- **THEN** RestX displays one virtual label node using the existing canonical display name
- **AND** preserves both problem relationships

#### Scenario: Graph contains many branches

- **WHEN** a scene or capability has multiple descendants
- **THEN** the UI keeps each layer visually distinct
- **AND** provides readable directional connections without overlapping node labels

### Requirement: Local problem content stays bounded and private

RestX SHALL send only bounded structured problem data across feature IPC and SHALL NOT persist Markdown bodies in renderer storage, display preferences, or logs.

#### Scenario: User previews a problem

- **WHEN** the user selects a current problem ID
- **THEN** main validates the ID against the scan snapshot and returns a bounded preview
- **AND** does not expose the absolute path

#### Scenario: User opens a problem externally

- **WHEN** the user requests system opening for a current problem ID
- **THEN** main resolves the registered file inside the knowledge root and opens only that file
- **AND** rejects arbitrary or stale paths
