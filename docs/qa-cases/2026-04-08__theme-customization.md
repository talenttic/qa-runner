# Theme Customization Manual QA
feature: theme-customization
date: 2026-04-08

## [theme-preset-switch] Switch theme presets
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A user can switch between theme presets.
- Expected: UI accents update to the selected preset.
- Notes:
- FailureReason:
### Steps
- [ ] Open the QA Runner UI.
- [ ] Click Theme.
- [ ] Select Emerald preset.
- [ ] Verify primary accents (buttons, badges, highlights) change to green.
- [ ] Select Sunset preset.
- [ ] Verify accents change to orange.
- [ ] Select Indigo preset.
- [ ] Verify accents revert to default.
- [ ] Verify browser console has no errors.
- [ ] Verify expected result: presets update the UI theme.

## [theme-custom-color] Use custom scheme
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A user can set a custom brand color.
- Expected: UI accents update to the chosen custom color.
- Notes:
- FailureReason:
### Steps
- [ ] Open the Theme panel.
- [ ] Select Custom preset.
- [ ] Pick a custom color.
- [ ] Verify buttons and accents reflect the custom color.
- [ ] Refresh the page.
- [ ] Verify the custom color persists.
- [ ] Verify browser console has no errors.
- [ ] Verify expected result: custom theme is applied and persisted.

## [theme-high-contrast] Toggle high contrast mode
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A user can enable high contrast mode for accessibility.
- Expected: UI switches to a high contrast palette.
- Notes:
- FailureReason:
### Steps
- [ ] Open the Theme panel.
- [ ] Enable High contrast.
- [ ] Verify backgrounds and text become higher contrast.
- [ ] Toggle High contrast off.
- [ ] Verify the UI returns to normal contrast.
- [ ] Verify browser console has no errors.
- [ ] Verify expected result: high contrast mode toggles correctly.
