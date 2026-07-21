# Change: Smart import AI tool presets

## Why

RestX currently uses a generic discovery framework, but the built-in tool definitions are compiled TypeScript objects. Adding another AI tool therefore still requires source changes and a rebuild. Users often know only a product name and perhaps one likely directory; they should not need to understand configuration, log, or JSONL storage layouts.

## What changes

- Store built-in definitions as declarative JSON and load user definitions from `~/.RestX/presets/` as JSON or YAML.
- Add an Inspector import wizard that collects a tool name, optional hints, and an authorized scan root.
- Collect a bounded metadata-only directory inventory and explicitly ask before sending it to the configured AI provider.
- Use a strict prompt and output parser to generate only the existing preset schema; never execute model-generated code.
- Validate and trial-scan a draft before showing it to the user.
- Save and enable a user preset only after explicit confirmation.
- Allow imported presets to be listed, disabled/enabled, and deleted.

## Impact

- Built-in and imported tools use the same discovery, folder, config, and JSONL viewers.
- Model requests and responses use the existing `~/.RestX/log` AI-call audit log.
- Raw configuration and conversation content are not included in smart-import requests.
