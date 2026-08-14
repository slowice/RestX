## ADDED Requirements

### Requirement: Semantic typography floor
RestX renderer SHALL apply a fixed semantic typography system in which decorative micro labels are at least 10px, auxiliary information is at least 11px, controls and sustained-reading text are at least 12px, and primary list or section text preserves a larger visual hierarchy.

#### Scenario: User reads application information
- **WHEN** a renderer page presents paths, dates, counts, descriptions, errors, form help, button labels, input content, list summaries, or result content
- **THEN** the text uses the semantic size appropriate to its role and is not reduced to a decorative micro-label size

#### Scenario: Page presents a decorative label
- **WHEN** a short badge or eyebrow does not carry the only copy of an important state or action
- **THEN** it may use the micro-label size but remains at least 10px

### Requirement: Readable layout after typography migration
RestX renderer SHALL preserve access to content and actions after typography is enlarged without applying whole-page zoom.

#### Scenario: Enlarged text occupies more space
- **WHEN** a migrated label, path, summary, or control no longer fits its previous area
- **THEN** the owning feature adjusts wrapping, truncation, column sizing, or minimum height so text does not overlap and key actions remain visible

### Requirement: AI history readability
The AI Inspector SHALL present session titles, question summaries, source paths, timestamps, tags, search controls, error messages, and JSONL detail content using the semantic typography floor and a clear hierarchy.

#### Scenario: User browses AI history
- **WHEN** the user views a Workspace session list, search result, JSONL event list, or JSONL entry detail
- **THEN** primary content is visually distinct from metadata and all user-relevant text remains readable
