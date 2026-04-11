# Standalone Demo Mode Manual QA
feature: standalone-demo-mode
date: 2026-04-08

## [demo-loads-sample] Loads sample suite without daemon
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A new user can open the UI without a running daemon and see a sample suite.
- Expected: Demo mode banner appears and sample cases are visible.
- Notes:
- FailureReason:
### Steps
- [ ] Start the UI with `npm run dev` and do not run the QA Runner daemon.
- [ ] Open `http://localhost:5174`.
- [ ] Verify a demo mode banner appears.
- [ ] Verify a sample suite is selectable and sample cases are listed.
- [ ] Verify selecting a case shows steps and expected result.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify sample data renders without JSON parse errors.

## [demo-actions-blocked] Demo mode blocks server-backed actions
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: Server-backed actions should be blocked in demo mode.
- Expected: The UI shows a message indicating a daemon connection is required.
- Notes:
- FailureReason:
### Steps
- [ ] In demo mode, click Create Share Link.
- [ ] Verify a message indicates daemon connection is required.
- [ ] Verify to add a comment or collaborator
- [ ] Verify a message indicates daemon connection is required.
- [ ] Verify to create a GitHub issue
- [ ] Verify a message indicates daemon connection is required.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify actions are blocked with clear messaging.
