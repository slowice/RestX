## ADDED Requirements

### Requirement: List managed RestX AI Skills
The system SHALL treat valid `SKILL.md` files in direct child directories of the configured skills root as the only persistent skill records and SHALL return them ordered by most recently updated first.

#### Scenario: List valid skills
- **WHEN** the user opens the “常用技能” page and the skills root contains valid skill directories
- **THEN** the system displays each skill's name and description with edit, delete, and execute actions

#### Scenario: Encounter an invalid managed file
- **WHEN** a direct child contains a malformed, oversized, or schema-incompatible `SKILL.md`
- **THEN** the system reports that the managed entry is invalid without exposing its absolute path or treating its content as a valid skill

### Requirement: Create and edit skills
The system SHALL allow the user to create a skill with a name, optional description, and non-empty fixed prompt, and SHALL persist edits atomically while keeping the skill ID and directory stable.

#### Scenario: Create a skill
- **WHEN** the user submits valid name, description, and prompt values
- **THEN** the system generates a non-conflicting local ID and stores a valid `~/.restx/skills/<skill-id>/SKILL.md`

#### Scenario: Edit a skill
- **WHEN** the user saves valid changes to an existing skill
- **THEN** the system atomically replaces its `SKILL.md`, preserves its ID and creation time, and advances its update time

#### Scenario: Reject invalid input
- **WHEN** the user submits missing, blank, oversized, or incorrectly typed fields
- **THEN** the system rejects the request before changing any skill file and presents a field-level or normalized validation error

### Requirement: Recoverably delete a skill
The system SHALL require confirmation before deleting a skill and SHALL move the validated managed skill directory to the operating system trash instead of permanently erasing it.

#### Scenario: Confirm deletion
- **WHEN** the user confirms deletion of an existing skill
- **THEN** the system moves only that skill's validated directory to trash and refreshes the list

#### Scenario: Cancel deletion
- **WHEN** the user cancels the confirmation
- **THEN** the system leaves the skill and its file unchanged

### Requirement: Strictly import a RestX Skill file
The system SHALL provide a main-process file picker that accepts one standard RestX `SKILL.md`, strictly validates it, and copies it into the managed root with a newly generated local ID and timestamps.

#### Scenario: Import a valid RestX Skill
- **WHEN** the user selects a valid standard RestX `SKILL.md`
- **THEN** the system creates an independent managed copy and leaves the source file unchanged

#### Scenario: Cancel import
- **WHEN** the user closes the file picker without selecting a file
- **THEN** the system returns a cancelled outcome and creates no skill

#### Scenario: Reject an incompatible import
- **WHEN** the selected file is a symlink, oversized, missing required Frontmatter, has invalid fields, or has an empty body
- **THEN** the system rejects the import and creates no managed skill

### Requirement: Execute a fixed prompt through the active AI Provider
The system SHALL re-read the selected skill from disk and execute its fixed Markdown prompt as a one-shot text request through the currently active RestX AI Provider without granting tools, shell access, or filesystem access.

#### Scenario: Execute successfully
- **WHEN** the user clicks the execute button for a valid skill and an active provider is configured
- **THEN** the system sends the current on-disk prompt once and displays the returned text as the latest result

#### Scenario: Provider is unavailable
- **WHEN** the user executes a skill without a usable active provider
- **THEN** the system performs no skill mutation and displays a normalized provider configuration error

#### Scenario: Prevent overlapping execution
- **WHEN** one skill execution is in progress
- **THEN** the system rejects or disables additional skill executions until the current request completes or times out

### Requirement: Keep only the latest result in memory
The system SHALL keep at most the latest execution result in renderer memory, SHALL allow its text to be copied, and SHALL not persist execution results or history.

#### Scenario: Display and copy a result
- **WHEN** a skill execution completes successfully
- **THEN** the result panel identifies the executed skill, displays its returned text, and provides a copy action

#### Scenario: Leave the feature
- **WHEN** the renderer page is unloaded or the application restarts
- **THEN** the prior execution result is no longer available

### Requirement: Enforce the feature security boundary
The system SHALL expose only fixed, typed skill operations through preload, SHALL validate all IPC input, and SHALL constrain filesystem operations to non-symbolic-link entries below the managed skills root.

#### Scenario: Reject a path escape
- **WHEN** a crafted ID or filesystem entry would resolve outside the managed skills root
- **THEN** the system rejects the operation before any external file is read, changed, trashed, or executed

#### Scenario: Normalize internal failures
- **WHEN** filesystem, parsing, provider, or operating-system operations fail
- **THEN** the renderer receives a feature-owned error code and safe message without credentials, prompt content, model output, or absolute paths
