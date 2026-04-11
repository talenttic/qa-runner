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

---

## Implementation Plan: AI Executes Manual Steps (Watch-Only)

### Goal
Allow a user to write manual checklist steps in this markdown suite, then click a single action in QA Runner:
- AI opens the target URL
- AI follows each step in order (click/fill/navigate/verify)
- Each step is marked automatically as done or failed (with a failure reason)
- User only watches: status updates + Playwright UI + artifacts (trace/video/report)

### Deliverables (What "Done" Means)
- Backend endpoint: `POST /plugin/qa/runs/:runId/manual/ai/execute`
  - Input: `baseUrl`, optional `startPath`, `caseId` (or "run all cases"), `credentials` (email/password), and execution mode.
  - Output: `executionJobId`, status, and `playwrightUiUrl` (when running in UI mode).
- Step executor:
  - Parses the run detail (cases + ordered steps).
  - Executes each step using Playwright (single worker, sequential).
  - Updates QA run state using the same step/case update logic as the UI.
- Evidence & artifacts:
  - Adds evidence refs for trace/video/report to the run as metadata (no binary uploads).
  - Stores a per-step action log summary (what was clicked/filled and what was verified).
- UI:
  - New button on manual run page: `AI Run Checklist (Watch Only)`.
  - Shows current step, live status, and a link to `Playwright UI` when enabled.

### Step Text Spec (AI-Executable Checklist DSL)
To keep behavior deterministic, AI execution only guarantees support for steps written in these patterns:
- `Open <path>` or `Open <url>`
- `Fill <field>: <valueRef>` where `<valueRef>` can be `E2E_EMAIL` or `E2E_PASSWORD`
- `Click <label>` (button/link)
- `Verify <text>` (text visible)
- `Verify URL contains <value>`
- `Verify no JavaScript errors`
- `Verify no failed network requests`

Any step outside these patterns is treated as:
- `manual_required` (AI marks as failed with a clear message), unless a mapping is added.

### Execution Behavior
- Sequential steps, single worker.
- If a step fails:
  - Mark the step failed with failure reason.
  - Mark the case failed.
  - Stop (default) or continue (optional flag).

### Milestones
1. API contract + state updates
   - Implement `manual/ai/execute` endpoint and `executionJob` tracking.
   - Prove: steps change state in UI without manual clicking.
2. Playwright driver + selectors
   - Use stable selectors (`getByRole`, `getByLabel`, `getByTestId`).
   - Add optional mapping table for project-specific selectors.
3. Observability
   - Collect console errors and failed network requests.
   - Expose a human-readable step log for debugging.
4. UX
   - Single beginner button + tooltips.
   - Show artifacts and Playwright UI link.

### Acceptance Checks (User-Visible)
- Given the `[login-ai]` case below and a working app:
  - AI completes login steps.
  - Run shows checked steps and a completed status.
  - On a deliberate failure (wrong password), AI marks the failing step and case as failed with a useful reason.

## [login-ai] AI Login Flow (Example For Executor)
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: AI performs login steps exactly like a human following a checklist.
- Expected: User is logged in and redirected away from `/login`.
- Notes:
- FailureReason:

### Steps
- [ ] Open /login
- [ ] Fill Email: E2E_EMAIL
- [ ] Fill Password: E2E_PASSWORD
- [ ] Click Login
- [ ] Verify URL contains /dashboard
- [ ] Verify no JavaScript errors
- [ ] Verify no failed network requests
