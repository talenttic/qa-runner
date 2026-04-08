# Manual Testing Core Flow
feature: manual-testing
date: 2026-03-28

## [run-create] Create manual QA run
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: Start a manual run and verify case list loads.
- Expected: Run is created and cases are visible for execution.
- Notes:
- FailureReason:

### Steps
- [ ] Open /manual-testing
- [ ] Select suite
- [ ] Click Start Run
- [ ] Verify case list and status chips are visible
- [ ] Open browser DevTools console and verify no JavaScript errors
- [ ] Open browser network tab and verify API requests complete without failed calls

## [step-update] Update step checks and finalize
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: Execute steps and persist state updates.
- Expected: Step checks, notes, and finalize status persist to UI and markdown file.
- Notes:
- FailureReason:

### Steps
- [ ] Open an existing run
- [ ] Toggle at least one step checkbox
- [ ] Add notes and evidence
- [ ] Finalize run
- [ ] Verify markdown file reflects status changes
- [ ] Verify browser console has no JavaScript errors during save/finalize
- [ ] Verify network/API requests for update and finalize return success status codes
