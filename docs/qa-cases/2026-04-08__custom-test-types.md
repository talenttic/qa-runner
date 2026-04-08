# Custom Test Types Plugin Manual QA
feature: custom-test-types
date: 2026-04-08

## [custom-types-load] Custom test types load in UI
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A user can define custom test types via plugin config.
- Expected: Custom test types appear in the AI mode checklist.
- Notes:
- FailureReason:
### Steps
- [ ] Add a custom entry to `tools/qa-runner.plugins.json`.
- [ ] Start the QA Runner daemon.
- [ ] Open the UI and switch to AI mode.
- [ ] Verify the Custom Test Types section appears.
- [ ] Verify custom test types match the config (label/description).
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: custom types load successfully.

## [custom-types-select] Select custom test types
- Priority: low
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A user can select a custom test type.
- Expected: Custom type can be checked and remains selected.
- Notes:
- FailureReason:
### Steps
- [ ] In AI mode, select a custom test type checkbox.
- [ ] Verify the checkbox stays selected.
- [ ] Run Prepare AI Run (if enabled) to ensure no UI errors.
- [ ] Verify browser console has no errors.
- [ ] Verify expected result: custom type selection is preserved.
