## ADDED Requirements

### Requirement: Merge request platforms use a common adapter contract
RestX SHALL obtain merge request metadata, changed files, diffs, and optional file content through a platform-neutral adapter selected from the pasted URL.

#### Scenario: Adapter recognizes a URL
- **WHEN** a pasted URL matches a registered adapter host and path format
- **THEN** RestX parses a normalized platform, repository owner, repository name, and merge request number

#### Scenario: No adapter recognizes a URL
- **WHEN** a pasted URL does not match any configured adapter
- **THEN** RestX rejects it with a supported-platform message without performing a network request

### Requirement: GitCode pull requests are readable through official APIs
RestX SHALL accept GitCode `/pull/{number}` and `/pulls/{number}` page URLs and retrieve their metadata and changed text patches through GitCode API v5.

#### Scenario: Merged GitCode PR is reviewed
- **WHEN** the user provides a merged GitCode PR URL and a valid PAT
- **THEN** RestX loads and previews the retained changes without rejecting the PR because of its merged state

#### Scenario: GitCode requires authentication
- **WHEN** GitCode returns an authentication failure
- **THEN** RestX asks the user to configure or replace the GitCode PAT and does not expose the remote error body as code content

### Requirement: GitCode credentials are protected
RestX MUST store the GitCode PAT with operating-system secure storage and MUST send it only in an authentication header.

#### Scenario: PAT is saved
- **WHEN** the user saves a non-empty GitCode PAT and secure storage is available
- **THEN** the renderer receives only an `accessTokenConfigured` flag and can never read the stored token

#### Scenario: API request is logged
- **WHEN** RestX records GitCode request diagnostics
- **THEN** the log contains neither the PAT nor a URL query parameter containing the PAT

### Requirement: CodeHub has an explicit extension boundary
RestX SHALL register a yellow-zone CodeHub adapter contract even when platform API details are not yet available.

#### Scenario: Blue-zone user pastes CodeHub URL before configuration
- **WHEN** the CodeHub adapter cannot recognize or call the configured platform
- **THEN** RestX reports that the yellow-zone adapter needs to be completed in the yellow environment and does not fall back to GitCode
