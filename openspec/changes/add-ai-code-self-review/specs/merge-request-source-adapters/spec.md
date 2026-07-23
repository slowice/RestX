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

### Requirement: GitCode current-user pull requests are discoverable
RestX SHALL read the authenticated GitCode user's currently open, self-created Pull Requests through the official current-user API and SHALL use the local global Git email only to verify the account identity.

#### Scenario: Local Git email matches the authorized account
- **WHEN** the configured global Git email is present among the GitCode account's confirmed emails
- **THEN** RestX shows the account as matched and lists its open Pull Requests ordered by recent updates

#### Scenario: Local Git email does not match
- **WHEN** the local Git email is absent or differs from the PAT account emails
- **THEN** RestX clearly shows the unmatched identity state while keeping the PAT account as the authoritative list owner

#### Scenario: User selects a listed Pull Request
- **WHEN** the user chooses an item from the current-user Pull Request list
- **THEN** RestX uses its normalized web URL in the existing source-preview flow without requiring manual paste

### Requirement: CodeHub has an explicit extension boundary
RestX SHALL register a yellow-zone CodeHub adapter contract even when platform API details are not yet available.

#### Scenario: Blue-zone user pastes CodeHub URL before configuration
- **WHEN** the CodeHub adapter cannot recognize or call the configured platform
- **THEN** RestX reports that the yellow-zone adapter needs to be completed in the yellow environment and does not fall back to GitCode

### Requirement: CodeHub PRIVATE-TOKEN is protected independently
RestX SHALL allow the user to save, replace, and remove a CodeHub credential named `PRIVATE-TOKEN` using operating-system secure storage without making a CodeHub network request.

#### Scenario: PRIVATE-TOKEN is saved
- **WHEN** the user saves a non-empty CodeHub `PRIVATE-TOKEN` and secure storage is available
- **THEN** RestX stores only encrypted token material and returns only a `privateTokenConfigured` flag to the renderer

#### Scenario: CodeHub adapter is implemented later
- **WHEN** a future yellow-zone adapter needs the configured credential
- **THEN** it can read the secret internally for the `PRIVATE-TOKEN` request header without changing renderer or preload contracts
