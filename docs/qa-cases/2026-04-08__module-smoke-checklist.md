---
feature: "QA Runner Module Smoke Checklist"
date: "2026-04-08"
---

# QA Runner Module Smoke Checklist

## [ui-boot] UI Starts And Loads Suites
Use Case: Confirm the UI loads and can read local QA suites without errors.
Expected: The UI renders, shows at least one suite, and no console errors appear.
Priority: P1
Status: Not Started

### Steps
- [ ] Start the daemon (`qa-runner daemon start`) from the project root.
- [ ] Open the UI at `http://localhost:4545/ui`.
- [ ] Verify at least one QA suite appears in the list
- [ ] Open a suite and verify case details render.
- [ ] Verify no JavaScript errors

## [run-basic] Create And Complete A Manual Run
Use Case: Verify a manual run can be created, updated, and finalized.
Expected: A run can be created, case status updates persist, and finalization succeeds.
Priority: P1
Status: Not Started

### Steps
- [ ] Create a new manual run for an existing suite.
- [ ] Select a case and mark at least one step complete.
- [ ] Add notes to the case and save.
- [ ] Mark the case as passed or failed.
- [ ] Finalize the run and confirm status updates.

## [sharing] Collaboration Sharing Works
Use Case: Confirm share links and collaborators can be added.
Expected: Share link is created and collaborators appear in the list.
Priority: P2
Status: Not Started

### Steps
- [ ] Add a collaborator name and verify it appears in the list.
- [ ] Create a share link and open it in a new tab.
- [ ] Verify the shared view shows run summary information.

## [reporting] Advanced Report Export
Use Case: Ensure reports can be exported for a completed run.
Expected: JSON/Markdown/HTML exports are generated without errors.
Priority: P2
Status: Not Started

### Steps
- [ ] Open a completed run.
- [ ] Download JSON report and confirm file exists.
- [ ] Download Markdown report and confirm file exists.
- [ ] Download HTML report and open it to verify formatting.

