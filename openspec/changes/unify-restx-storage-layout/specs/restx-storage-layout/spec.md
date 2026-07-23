## ADDED Requirements

### Requirement: RestX uses one lowercase application data root
RestX SHALL place all application-owned configuration, encrypted credentials, cache, logs, user presets, and Electron runtime data below `~/.restx` and MUST NOT create new application data below `~/.RestX`.

#### Scenario: Application starts after migration
- **WHEN** RestX initializes its persistent storage
- **THEN** configuration is written below `~/.restx/config`, cache below `~/.restx/cache`, logs below `~/.restx/logs`, and Electron userData below `~/.restx/runtime`

### Requirement: Persistent writers use the directory matching their lifecycle
RestX MUST route settings, encrypted source credentials, and AI Provider records to `config`; disposable analysis results to `cache`; operational JSONL records to `logs`; and user presets to `config/presets`.

#### Scenario: User saves credentials and runs reviews
- **WHEN** the user saves an API Key, GitCode PAT, or CodeHub PRIVATE-TOKEN and later runs analysis or code review
- **THEN** credential ciphertext is stored only in `config`, cache records are stored only in `cache`, and audit records are appended only in `logs`

### Requirement: Existing application data migrates before feature initialization
RestX SHALL migrate legacy Electron userData and `~/.RestX` content before constructing or reading feature-owned persistent stores.

#### Scenario: Existing installation starts with legacy data
- **WHEN** legacy settings, credentials, cache, logs, presets, or runtime files exist and the corresponding new target does not
- **THEN** RestX moves them into the matching `~/.restx` subdirectory before registering application features

#### Scenario: Migration is interrupted and retried
- **WHEN** only part of the legacy data was migrated during a previous start
- **THEN** the next start safely continues remaining entries without overwriting completed targets

### Requirement: Case-only legacy paths are normalized safely
RestX MUST correctly normalize `.RestX` to `.restx` on both case-sensitive and case-insensitive file systems.

#### Scenario: Legacy and target names resolve to the same directory
- **WHEN** the file system treats `~/.RestX` and `~/.restx` as the same inode
- **THEN** RestX changes the actual directory entry to lowercase through a safe temporary name before organizing its contents

#### Scenario: Separate legacy and target directories exist
- **WHEN** the file system treats `.RestX` and `.restx` as distinct directories
- **THEN** RestX keeps the lowercase target authoritative and merges non-conflicting legacy entries without overwriting target files

### Requirement: Migration preserves secrets and unique data
RestX MUST move encrypted credential bytes without decrypting or re-encrypting them and MUST NOT delete a source item unless the corresponding move or copy completed successfully.

#### Scenario: Target file already exists
- **WHEN** a legacy file and its target have the same name
- **THEN** RestX keeps the target unchanged and retains the legacy source for recovery

#### Scenario: Storage migration encounters an error
- **WHEN** a file cannot be moved or copied safely
- **THEN** RestX preserves the source, avoids logging secret contents, and continues startup using available new-directory data
