## ADDED Requirements

### Requirement: Presets support portable absolute path templates
The tool scanning feature SHALL allow probes and sources to declare either an existing scan-root-relative path or a portable absolute `path` template using `${HOME}`, `${TEMP}`, and `${UID}` variables.

#### Scenario: Existing relative preset remains compatible
- **WHEN** a preset item declares `relativePath` without `path`
- **THEN** the system resolves it under the user-selected scan root with unchanged behavior

#### Scenario: Home and temporary paths resolve on macOS and Windows
- **WHEN** a preset item declares `${HOME}` or `${TEMP}` in `path`
- **THEN** the system resolves the template using the injected or operating-system-specific home and temporary directories without assuming POSIX separators

#### Scenario: Invalid path declaration is rejected
- **WHEN** a preset item declares both `relativePath` and `path`, neither field, an unknown variable, or traversal outside a relative root
- **THEN** preset validation rejects the declaration before scanning

### Requirement: Presets can filter fixed locations by operating system
The tool scanning feature SHALL allow a probe or source to declare a bounded list of Node platform identifiers and SHALL skip the item when the current platform is not listed.

#### Scenario: macOS-only source is skipped on Windows
- **WHEN** a source declares `platforms: ["darwin"]` and discovery runs with platform `win32`
- **THEN** the source is not resolved, scanned, or authorized

### Requirement: Portable paths support bounded terminal wildcard matching
The tool scanning feature SHALL support `*` only in the final path segment and SHALL enumerate only immediate children of the resolved parent directory.

#### Scenario: Windows temporary OpenClaw directory is matched
- **WHEN** `${TEMP}/openclaw*` is resolved and the temporary directory contains `openclaw-1001`
- **THEN** the matching directory is returned as a source root without recursively enumerating unrelated temporary directories

#### Scenario: Unsafe wildcard is rejected
- **WHEN** a path contains a wildcard in a parent segment or uses recursive glob syntax
- **THEN** preset validation rejects the path

### Requirement: Resolved external source roots remain usable through IPC
The tool scanning feature SHALL authorize the real directories of external sources belonging to a detected tool before returning their candidates.

#### Scenario: User opens an external Gateway log
- **WHEN** discovery finds a Gateway log outside the selected scan root
- **THEN** subsequent JSONL page, detail, search, and reveal requests for that log pass the existing path authorization check

#### Scenario: Undetected tool does not expand authorization
- **WHEN** a preset's probes do not detect its tool
- **THEN** none of that preset's external source roots are authorized
