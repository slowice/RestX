# Folder-grouped result specification

## ADDED Requirements

### Requirement: Scan results are grouped by tool and folder

RestX SHALL present the default scan result as a hierarchy of tool folders, category folders, optional physical subfolders, and files rather than one flat cross-tool list.

#### Scenario: Multiple tools are detected

- **WHEN** Codex and Claude Code are detected
- **THEN** the first result level shows separate Codex and Claude Code tool folders
- **AND** each folder displays its configuration, instruction, and log counts

#### Scenario: User opens a tool folder

- **WHEN** the user selects a detected tool
- **THEN** RestX displays only that tool's non-empty category folders
- **AND** shows a breadcrumb back to all tools

#### Scenario: User opens a configuration file

- **WHEN** the user selects a configuration candidate inside a folder
- **THEN** RestX reuses the existing configuration detail and AI analysis panel
- **AND** folder navigation remains available

### Requirement: Search preserves tool context

RestX SHALL search within the current tool by default and group all-tool search results by tool and folder.

#### Scenario: Search matches files from two tools

- **WHEN** the user switches search scope to all tools and enters a matching query
- **THEN** results are grouped under their owning tool folders
- **AND** are not rendered as one unlabelled flat list

### Requirement: Generic candidates do not pollute the default home scan

RestX SHALL keep broad generic recursive results separate from preset-owned tool results and SHALL NOT run the broad scan by default for a user-home scan.

#### Scenario: User home contains unrelated JSON files

- **WHEN** a user-home scan detects supported AI tools and also contains unrelated JSON files elsewhere
- **THEN** unrelated files do not appear inside any tool folder
- **AND** the user may explicitly request the separate “other candidates” scan
