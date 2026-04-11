# Generated QA

Source prompt: Dogfood QA Runner features for this repo: manual AI checklist executor, self-healing retries, AI auto-testing, flakiness insights, and run/report workflows.

## [case-1] Primary Happy Path

Use Case: Dogfood QA Runner section navigation and visibility checks.

Expected Result: App sections can be opened and expected labels are visible.

Priority: high
Status: Not Started

### Steps
- [ ] Open base URL
- [ ] Click AI Testing
- [ ] Verify AI Testing
- [ ] Click Team & Collaboration
- [ ] Verify Team Hub

## [case-2] Input Validation Path

Use Case: Validate observability checks for browser console and network.

Expected Result: QA Runner UI loads without JS console errors and failed requests.

Priority: medium
Status: Not Started

### Steps
- [ ] Open base URL
- [ ] Verify QA Runner
- [ ] Verify no JavaScript errors
- [ ] Verify no failed network requests

## [case-3] Recovery and Retry Path

Use Case: Validate settings accessibility and return path.

Expected Result: Settings section opens and user can return to Manual Testing view.

Priority: medium
Status: Not Started

### Steps
- [ ] Open base URL
- [ ] Click Settings
- [ ] Verify Settings
- [ ] Click Manual Testing
- [ ] Verify QA Runner
