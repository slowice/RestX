## ADDED Requirements

### Requirement: Reveal every real history source file
The AI Inspector SHALL provide an action labeled “打开文件位置” anywhere its history browser presents a real source file, including ordinary history file rows, Workspace session rows, Workspace search results, and the JSONL detail header.

#### Scenario: User reveals a history source
- **WHEN** the user activates “打开文件位置” for a currently available authorized source file
- **THEN** the operating system file manager opens the parent directory and selects that file

#### Scenario: User opens a compact detail layout
- **WHEN** a history detail pane is visible beside its source list
- **THEN** the current source still exposes an accessible “打开文件位置” action

### Requirement: Preserve the authorized path boundary
The AI Inspector main process MUST validate the request string, confirm the target remains inside an authorized scan root, and confirm the file exists before asking Electron to reveal it.

#### Scenario: Renderer submits an unauthorized path
- **WHEN** a reveal request targets a path outside the authorized scan roots
- **THEN** the main process rejects the request without invoking the operating system file manager

#### Scenario: History content contains a path-like string
- **WHEN** a JSONL record or other history content includes arbitrary text that resembles a filesystem path
- **THEN** RestX does not turn that text into a reveal action unless it is the actual authorized source file

### Requirement: Recoverable reveal failure
The AI Inspector SHALL report a reveal failure within the current page without clearing loaded history or blocking unrelated browsing.

#### Scenario: Source file was removed
- **WHEN** the user activates the reveal action after the authorized source file has been moved or deleted
- **THEN** the page displays a concise error and retains the current history state
