# GitHub Issue Integration Manual QA
feature: github-issue-integration
date: 2026-04-08

## [github-issue-create] Create GitHub issue from QA run
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can create a GitHub issue from a QA run to track failures.
- Expected: A GitHub issue is created with the provided fields and link opens.
- Notes:
- FailureReason:
### Steps
- [ ] Ensure QA Runner daemon has `QA_RUNNER_GITHUB_TOKEN` set.
- [ ] Open a manual run with at least one case.
- [ ] In GitHub Issue, enter Owner/org and Repo.
- [ ] Enter Issue title, body, labels, and assignees.
- [ ] Click Create GitHub Issue.
- [ ] Verify a success message is displayed.
- [ ] Click Open Issue and confirm it opens in GitHub.
- [ ] Verify the created issue contains the entered fields.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: issue is created and accessible.

## [github-issue-missing-fields] Validate required fields
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: The UI blocks issue creation when required fields are missing.
- Expected: A validation message appears and no issue is created.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run.
- [ ] Leave Owner/org, Repo, or Title blank.
- [ ] Click Create GitHub Issue.
- [ ] Verify a validation message appears.
- [ ] Verify no issue is created in GitHub.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: issue creation is blocked until required fields are provided.

## [github-issue-auth-missing] Handle missing token
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: The integration fails gracefully when the GitHub token is missing.
- Expected: An error message is shown and no issue is created.
- Notes:
- FailureReason:
### Steps
- [ ] Restart QA Runner daemon without `QA_RUNNER_GITHUB_TOKEN`.
- [ ] Open a manual run and fill in GitHub Issue fields.
- [ ] Click Create GitHub Issue.
- [ ] Verify an error message appears.
- [ ] Verify no issue is created in GitHub.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: user sees a clear error for missing token.
