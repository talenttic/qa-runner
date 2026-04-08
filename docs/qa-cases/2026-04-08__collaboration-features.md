# Collaboration Features Manual QA
feature: collaboration-features
date: 2026-04-08

## [collab-add-participant] Add collaborator to a run
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can add collaborator names to a manual run so the team can coordinate.
- Expected: Collaborator appears in the list and persists for the current run.
- Notes:
- FailureReason:
### Steps
- [ ] Open QA Runner manual mode and select a suite.
- [ ] Start a run (or open an existing run).
- [ ] In Collaboration, enter a collaborator name and click Add.
- [ ] Verify the collaborator chip appears in the list.
- [ ] Refresh the page and reopen the same run.
- [ ] Verify the collaborator list still shows the added name.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: collaborator is visible and persisted for the run.

## [collab-remove-participant] Remove collaborator from a run
- Priority: low
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can remove collaborators that are no longer participating.
- Expected: Collaborator is removed from the list immediately.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run that has collaborators listed.
- [ ] Click the remove (×) action on a collaborator chip.
- [ ] Verify the collaborator is removed from the list.
- [ ] Refresh the page and reopen the same run.
- [ ] Verify the removed collaborator does not return.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: collaborator is removed and stays removed.

## [collab-add-comment] Add a case comment
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can leave a comment on a test case for teammates.
- Expected: Comment appears with author and timestamp and persists for the case.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run and select a test case.
- [ ] In Comments, enter an author name and a comment message.
- [ ] Click Post.
- [ ] Verify the comment appears with the correct author and timestamp.
- [ ] Refresh the page and reopen the same run and case.
- [ ] Verify the comment still appears.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: comment is visible and persisted for the case.

## [collab-remove-comment] Remove a case comment
- Priority: low
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can remove a comment that is no longer relevant.
- Expected: Comment is removed from the list immediately.
- Notes:
- FailureReason:
### Steps
- [ ] Open a test case with at least one comment.
- [ ] Click Remove on a comment entry.
- [ ] Verify the comment disappears from the list.
- [ ] Refresh the page and reopen the same run and case.
- [ ] Verify the removed comment does not return.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: comment is removed and stays removed.

## [collab-share-link] Share run link
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can create a share link for a run so teammates can view the summary remotely.
- Expected: A share URL is copied and the shared view renders run data.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run with at least one case.
- [ ] Click Create Share Link.
- [ ] Paste from clipboard into a text field.
- [ ] Verify the clipboard contains a URL ending in `/ui/share/<share-id>`.
- [ ] Open the share URL in a new browser tab.
- [ ] Verify the shared view shows run status, collaborators, and case summaries.
- [ ] Verify a success message is displayed after creating the link.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify expected result: share link is copied and renders the run summary.
