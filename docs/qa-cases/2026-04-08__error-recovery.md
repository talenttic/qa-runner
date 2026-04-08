# Error Recovery & Resilience Manual QA
feature: error-recovery
date: 2026-04-08

## [resilience-retry-load] Retry data loading after failure
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can retry loading suites after a transient error.
- Expected: Retry buttons reload data successfully.
- Notes:
- FailureReason:
### Steps
- [ ] Start the UI with daemon running, then stop the daemon temporarily.
- [ ] Reload the UI and observe an error message.
- [ ] Restart the daemon.
- [ ] Click Retry Load.
- [ ] Verify suites load successfully.
- [ ] Click Retry Runtime.
- [ ] Verify runtime status updates.
- [ ] Verify browser console has no errors.
- [ ] Verify expected result: retry buttons recover gracefully.

## [resilience-error-boundary] Error boundary recovery actions
- Priority: low
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A user can recover from a UI crash using the error boundary actions.
- Expected: Reload or reset clears the error state.
- Notes:
- FailureReason:
### Steps
- [ ] Trigger a UI error intentionally (developer tooling or test hook).
- [ ] Verify the error boundary screen appears.
- [ ] Click Reload App and verify the UI reloads.
- [ ] Trigger error again and click Reset UI State.
- [ ] Verify local settings reset and UI reloads.
- [ ] Verify expected result: recovery actions work.

## [resilience-auto-retry] Automatic retry for fetches
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: The UI retries GET calls automatically on transient errors.
- Expected: Data loads after brief network interruptions.
- Notes:
- FailureReason:
### Steps
- [ ] Open the UI and throttle network to simulate a transient failure.
- [ ] Trigger a fetch (reload suites or open a run).
- [ ] Verify the UI eventually loads without manual retries.
- [ ] Verify browser console has no errors after recovery.
- [ ] Verify expected result: retry logic recovers from transient failures.
