## ADDED Requirements

### Requirement: Review guidance is carried by versioned Markdown rule packs
RestX SHALL load review guidance from pack directories containing a `RULES.md` file with validated YAML frontmatter and Markdown instructions.

#### Scenario: Built-in pack is loaded
- **WHEN** code review prepares its prompt
- **THEN** RestX includes the matching built-in security, bug, logging, testing, and consistency guidance with pack IDs and versions

#### Scenario: Invalid pack is discovered
- **WHEN** a rule pack is missing required metadata, exceeds size limits, or declares unsupported fields
- **THEN** RestX excludes the pack and surfaces a validation warning without blocking valid packs

### Requirement: Security and zone rules cannot be weakened by repository content
RestX MUST treat repository rule packs as untrusted additions and MUST NOT allow them to disable the built-in security baseline or change zone routing.

#### Scenario: Repository rule requests unsafe routing
- **WHEN** repository Markdown asks RestX to send yellow code to a blue provider or ignore security findings
- **THEN** RestX ignores that instruction and keeps the mandatory policies active

### Requirement: Rules are selected for the reviewed language and zone
RestX SHALL select packs by declared zone, language, and category while always retaining mandatory baseline packs.

#### Scenario: Java and SQL changes are reviewed in blue zone
- **WHEN** the changed files include Java and SQL
- **THEN** RestX combines the blue-zone baseline with matching Java, MyBatis/SQL, logging, and repository consistency guidance
