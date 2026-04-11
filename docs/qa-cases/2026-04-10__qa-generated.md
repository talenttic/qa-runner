# Generated QA

Source prompt: File changes detected

## [case-1] Primary Happy Path

Use Case: Validate core QA Runner navigation flow in AI/manual sections.

Expected Result: User can navigate between Manual and AI sections and see stable UI content.

Priority: high
Status: Not Started

### Steps
- [ ] Open base URL
- [ ] Click AI Testing
- [ ] Verify AI Testing
- [ ] Click Manual Testing
- [ ] Verify QA Runner

## [case-2] Input Validation Path

Use Case: Validate runtime page load quality for console and network baseline.

Expected Result: UI loads with no JavaScript errors and no failed network requests.

Priority: medium
Status: Not Started

### Steps
- [ ] Open base URL
- [ ] Verify QA Runner
- [ ] Verify no JavaScript errors
- [ ] Verify no failed network requests

## [case-3] Recovery and Retry Path

Use Case: Verify settings navigation remains accessible after section switches.

Expected Result: Settings section opens and returns to Manual section without losing app shell state.

Priority: medium
Status: Not Started

### Steps
- [ ] Open base URL
- [ ] Click Settings
- [ ] Verify Settings
- [ ] Click Manual Testing
- [ ] Verify QA Runner
