## ADDED Requirements

### Requirement: Code review is available from the workspace navigation
RestX SHALL expose a Chinese “代码自检” workspace module with source selection, review preparation, execution progress, and results in one page.

#### Scenario: User opens code review
- **WHEN** the user selects “代码自检” in the sidebar
- **THEN** RestX shows zone selection, source input, review requirements, and an initially empty result area

### Requirement: User previews the exact review scope
RestX MUST show the merge request state, repository, branches, changed files, additions, deletions, excluded items, and estimated input size before enabling model review.

#### Scenario: GitCode merge request loads successfully
- **WHEN** the user pastes a supported GitCode PR URL and the source adapter returns changes
- **THEN** the page displays the normalized PR identity and a file-by-file sending preview

#### Scenario: Review has no eligible text changes
- **WHEN** all changed files are binary, oversized, or otherwise excluded
- **THEN** RestX explains why review cannot start and does not call the model

### Requirement: Review findings are structured and traceable
RestX SHALL display findings with severity, category, title, explanation, evidence, file path, changed line, rule source, confidence, and optional suggestion.

#### Scenario: Model returns valid findings
- **WHEN** a code review finishes successfully
- **THEN** the page groups findings by severity and allows filtering by category and file

#### Scenario: Finding does not reference the reviewed diff
- **WHEN** a model finding references an unknown file or invalid changed line
- **THEN** RestX excludes it from formal findings and does not present it as a confirmed issue

### Requirement: Review remains read-only
RestX MUST NOT modify source files, run repository scripts, fetch remotes, create commits, or write comments back to the code hosting platform during code review.

#### Scenario: User completes a remote review
- **WHEN** review results are displayed
- **THEN** no write request has been sent to GitCode or CodeHub and no repository content has changed

### Requirement: Code review matches the RestX visual language
RestX SHALL present the code review workspace with the application's light surfaces, neutral borders, and green interaction accent while retaining blue and yellow as explicit network-zone semantics.

#### Scenario: User opens code review beside another RestX module
- **WHEN** the user navigates between code review and another workspace module
- **THEN** page background, cards, controls, typography, and elevation remain visually consistent

### Requirement: Application identity is consistent at launch
RestX SHALL use its own application icon and the display name “RestX” for the window and packaged application, including the packaged operating-system hover label. Development mode SHALL use the RestX window title and custom Dock icon where the platform API supports it.

#### Scenario: User launches the packaged desktop application
- **WHEN** RestX starts as a packaged application
- **THEN** the operating system presents the RestX icon and name instead of the Electron defaults
