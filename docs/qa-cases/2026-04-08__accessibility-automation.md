# Accessibility Automation Manual QA
feature: accessibility-automation
date: 2026-04-08

## [a11y-automation-run] Run automated accessibility tests
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: Developers can run automated accessibility checks.
- Expected: The a11y test suite passes with no violations.
- Notes:
- FailureReason:
### Steps
- [ ] From `packages/qa-runner-ui`, run `npm run test:a11y`.
- [ ] Verify the test completes without errors.
- [ ] If failures occur, inspect the reported violations.
- [ ] Verify expected result: a11y checks run successfully.
