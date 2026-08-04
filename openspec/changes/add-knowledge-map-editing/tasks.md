## 1. Draft Domain and Contracts

- [x] 1.1 Add bounded batch-edit contracts and a fixed knowledge-map IPC method.
- [x] 1.2 Implement pure draft helpers for classification replacement, semantic removal, global label removal, difference calculation, and graph rebuilding.
- [x] 1.3 Add focused domain tests for pending transitions, normalization, global deletion, and orphan prevention.

## 2. Safe Batch Persistence

- [x] 2.1 Extend the Markdown writer to render classification replacement and managed-field clearing while preserving bodies and unknown metadata.
- [x] 2.2 Implement full-batch validation, fingerprint preflight, backups, temporary files, atomic replacement, and compensating rollback in main.
- [x] 2.3 Register the batch API through feature main, preload, and shared API boundaries.
- [x] 2.4 Add focused API and writer tests for successful multi-file save, whole-batch conflict rejection, semantic clearing, and rollback reporting.

## 3. Editing Interface

- [x] 3.1 Add editing-session state, live draft graph derivation, save/cancel actions, and unsaved-change safeguards to the knowledge-map page.
- [x] 3.2 Extend graph selection so problem and virtual label nodes can drive the editing inspector.
- [x] 3.3 Add problem classification controls, global label deletion confirmation, semantic problem removal, and matching feature-local styles.
- [x] 3.4 Add focused renderer tests for entering edit mode, editing several relationships, cancelling, deleting labels, saving, and preserving drafts on failure.

## 4. Verification and Integration

- [x] 4.1 Run the minimum relevant knowledge-map tests, typecheck, and diff hygiene checks; fix affected failures.
- [x] 4.2 Start a real isolated Electron instance and verify cancel, save, semantic problem removal, global label removal, and conflict behavior with test knowledge files.
- [x] 4.3 Review the worktree for scope and safety, integrate it into local `main`, create the final local commit, and remove the completed worktree and branch.
