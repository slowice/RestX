## ADDED Requirements

### Requirement: Knowledge map editing is an explicit draft session
RestX SHALL require users to enter editing mode before changing graph relationships, SHALL keep all changes in an in-memory session draft until save, and SHALL allow the entire draft to be discarded.

#### Scenario: User cancels several edits
- **WHEN** the user changes multiple problem relationships and then confirms cancel
- **THEN** RestX restores the most recent scanned graph
- **AND** no Markdown file is modified

#### Scenario: User attempts to leave with unsaved edits
- **WHEN** an editing session contains changes and the user refreshes, exits editing, or leaves the knowledge-map route
- **THEN** RestX requires confirmation before discarding the draft

### Requirement: Users can edit problem relationships without orphan labels
RestX SHALL let users assign exactly one scene and one or more capability and knowledge labels to a problem by reusing existing labels or entering new labels, and SHALL derive the preview graph from the complete draft.

#### Scenario: User associates a new label
- **WHEN** the user enters a valid new label while editing a selected problem
- **THEN** the draft associates the label with that problem
- **AND** the label appears in the preview graph without creating independent persisted metadata

#### Scenario: User completes a pending problem
- **WHEN** the user assigns a scene, at least one capability, and at least one knowledge label to a pending problem
- **THEN** the preview graph includes the problem as organized

### Requirement: Problem removal is semantic
RestX SHALL remove a problem from the organized graph by clearing only its managed classification fields and SHALL NOT delete or rewrite its Markdown body.

#### Scenario: User moves a problem back to pending
- **WHEN** the user semantically removes a selected problem and saves
- **THEN** RestX removes `type`, `scene`, `capability`, and `knowledge` from that problem
- **AND** preserves the file, body, and unrelated Frontmatter fields
- **AND** displays the problem as pending after the authoritative rescan

### Requirement: Label removal applies to every reference
RestX SHALL allow scene, capability, and knowledge nodes to be selected for global semantic removal, SHALL show their affected problem count before confirmation, and SHALL remove the normalized label from every referencing problem draft.

#### Scenario: User removes a globally referenced label
- **WHEN** the user confirms removal of a label referenced by several problems
- **THEN** RestX removes that label from all matching draft relationships
- **AND** removes the virtual node when it has no remaining reference

#### Scenario: Label removal makes a classification incomplete
- **WHEN** global label removal leaves a problem without a scene, capability, or knowledge label
- **THEN** RestX keeps the problem file and remaining draft fields
- **AND** moves the problem to the pending area

### Requirement: Batch saving rejects conflicts before writing
RestX SHALL submit only changed problems through a bounded feature-specific API and SHALL validate every target, label set, and original source fingerprint before replacing any file.

#### Scenario: One affected file changed externally
- **WHEN** any submitted problem no longer matches its original source fingerprint
- **THEN** RestX rejects the entire batch before modifying any target file
- **AND** retains the renderer draft for inspection

#### Scenario: Batch input is invalid
- **WHEN** a batch contains duplicate or stale problem IDs, exceeds its bound, or contains invalid labels
- **THEN** RestX rejects the entire batch without modifying knowledge files

### Requirement: Batch saving preserves recoverability
RestX SHALL create a private backup and same-directory temporary replacement for every changed problem, SHALL replace each file atomically, and SHALL attempt compensating restoration when a later replacement fails.

#### Scenario: Every replacement succeeds
- **WHEN** all changed files pass preflight and are replaced successfully
- **THEN** RestX keeps their backups
- **AND** rescans the knowledge root and returns the authoritative graph

#### Scenario: A later replacement fails
- **WHEN** at least one earlier target was replaced before a later replacement fails
- **THEN** RestX restores already replaced targets from the current batch backups
- **AND** reports whether the restoration completed
- **AND** does not report the batch as saved
