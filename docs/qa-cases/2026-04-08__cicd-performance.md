# CI/CD Performance Checks Manual QA
feature: cicd-performance
date: 2026-04-08

## [cicd-lighthouse] Lighthouse CI runs in workflow
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: CI runs Lighthouse audits on the UI build.
- Expected: Workflow passes and publishes Lighthouse report link.
- Notes:
- FailureReason:
### Steps
- [ ] Open a PR that touches `packages/qa-runner-ui`.
- [ ] Verify GitHub Action "UI Performance Checks" runs.
- [ ] Verify Lighthouse CI step completes and uploads a report.
- [ ] Verify browser console has no errors.
- [ ] Verify Lighthouse audit runs successfully.

## [cicd-bundle-size] Bundle size tracking runs in workflow
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: CI enforces bundle size thresholds.
- Expected: Workflow fails when size limits are exceeded.
- Notes:
- FailureReason:
### Steps
- [ ] Run the "UI Performance Checks" workflow.
- [ ] Verify the Bundle Size step runs.
- [ ] Verify size-limit reports asset sizes
- [ ] (Optional) Temporarily increase bundle size to confirm failure.
- [ ] Verify size-limit enforces thresholds.
