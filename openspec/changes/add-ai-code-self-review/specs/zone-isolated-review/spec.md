## ADDED Requirements

### Requirement: Source zone determines provider route
RestX MUST bind GitCode sources to the blue provider and CodeHub sources to the yellow provider, and MUST reject a user-supplied zone that conflicts with the selected adapter.

#### Scenario: GitCode PR is reviewed
- **WHEN** a valid GitCode PR is prepared in blue zone
- **THEN** RestX sends eligible diff content only to the configured blue provider

#### Scenario: CodeHub source is marked blue
- **WHEN** a request attempts to review a CodeHub source with the blue provider
- **THEN** the main process rejects the request before sending any source content

### Requirement: Yellow review never falls back to blue
RestX MUST fail closed when the yellow provider is unavailable, misconfigured, or returns an error.

#### Scenario: Yellow provider is unreachable
- **WHEN** a yellow-zone review cannot connect to its configured provider
- **THEN** RestX reports the yellow provider failure and makes no request to the blue provider

### Requirement: Code-bearing AI traffic is not logged
RestX MUST use a dedicated metadata-only audit path for code review and MUST NOT log diffs, prompts, model response bodies, absolute repository paths, or credentials.

#### Scenario: Review call completes
- **WHEN** a model review succeeds or fails
- **THEN** the audit event contains operational metadata only, such as review ID, zone, counts, model, duration, and status

### Requirement: Review cache expires and invalidates safely
RestX SHALL cache structured findings for at most seven days and SHALL invalidate them when source head/diff, model, prompt, or rule versions change.

#### Scenario: Same unchanged PR is reviewed within seven days
- **WHEN** all cache fingerprint inputs match
- **THEN** RestX may return the cached structured result without resending the diff

#### Scenario: PR receives a new commit
- **WHEN** the PR head SHA changes
- **THEN** the previous result is treated as stale even if it is less than seven days old

#### Scenario: Secure storage is unavailable
- **WHEN** RestX cannot protect a persistent cache encryption key
- **THEN** code review results remain in memory only and are not stored as plaintext
