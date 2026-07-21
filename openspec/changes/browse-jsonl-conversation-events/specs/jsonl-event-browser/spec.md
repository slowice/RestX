# JSONL event browser specification

## ADDED Requirements

### Requirement: Large JSONL files open through bounded tail paging

RestX SHALL open a JSONL file by reading a bounded page of complete lines from its tail and SHALL NOT read the entire file into memory or send the entire file over IPC.

#### Scenario: User opens a large session

- **WHEN** the user opens a valid 34 MiB JSONL conversation file
- **THEN** RestX returns the latest bounded page within the event and byte budgets
- **AND** provides a cursor for loading older complete lines

#### Scenario: User loads older records

- **WHEN** the user requests an older page with a valid cursor
- **THEN** RestX returns the preceding events in chronological order
- **AND** the UI prepends them while preserving scroll position

### Requirement: Event rows expose raw previews and semantic tags

RestX SHALL show each loaded JSONL line as a raw JSON-string preview with timestamp, parse status, and tags extracted through the selected declarative profile.

#### Scenario: Codex tool call is loaded

- **WHEN** an event profile reads a Codex `function_call` or `custom_tool_call` value
- **THEN** the row includes a “工具调用” tag
- **AND** still shows its raw JSON preview

#### Scenario: Claude thinking content is loaded

- **WHEN** an event contains a `message.content` item whose type is `thinking`
- **THEN** the row includes a “思考” tag

#### Scenario: Event type is unknown

- **WHEN** a valid event contains an unmapped bounded type value
- **THEN** RestX keeps it visible as a neutral raw-value tag

### Requirement: Selected lines have formatted JSON detail

RestX SHALL fetch one selected bounded line by byte offset and display pretty JSON together with an optional raw-line view.

#### Scenario: User selects a valid row

- **WHEN** the user selects a valid JSON object row
- **THEN** RestX displays `JSON.stringify(value, null, 2)` as text
- **AND** provides a separate raw-line tab and explicit copy action

#### Scenario: User selects malformed JSON

- **WHEN** the selected line cannot be parsed
- **THEN** RestX displays the raw line and parse error
- **AND** other rows remain usable

### Requirement: File mutation is handled explicitly

RestX SHALL detect append, truncation, rotation, deletion, and permission changes between page/detail requests.

#### Scenario: Session receives new appended events

- **WHEN** a JSONL file grows after the initial page
- **THEN** the viewer reports that new records are available
- **AND** loads them only after user action

#### Scenario: Session is truncated or rotated

- **WHEN** the current snapshot no longer contains a previously valid cursor
- **THEN** RestX invalidates the cursor and asks the user to refresh
- **AND** does not combine lines from incompatible snapshots

### Requirement: Conversation content remains local and ephemeral

RestX SHALL NOT automatically send JSONL content to an AI provider or persist raw/parsed conversation content in localStorage, analysis cache, or AI call logs.

#### Scenario: User browses a session

- **WHEN** pages and entries are loaded and viewed
- **THEN** only bounded responses cross the local main/renderer IPC boundary
- **AND** no conversation content is added to persistent RestX stores
