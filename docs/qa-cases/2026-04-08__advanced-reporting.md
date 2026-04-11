# Advanced Reporting Manual QA
feature: advanced-reporting
date: 2026-04-08

## [report-html-export] Export HTML report
- Priority: high
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can export a run report as HTML.
- Expected: An HTML file downloads and renders the report summary.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run with at least one case.
- [ ] Click Download Report HTML.
- [ ] Open the downloaded HTML file in a browser.
- [ ] Verify the report shows run ID, suite name, summary metrics, and case list.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify HTML report renders correctly.

## [report-pdf-print] Print PDF report
- Priority: medium
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can print a run report to PDF.
- Expected: Print dialog opens with formatted report content.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run with at least one case.
- [ ] Click Print PDF.
- [ ] Verify the print dialog opens.
- [ ] Save to PDF and open the file.
- [ ] Verify the PDF contains the report summary and case list.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify PDF output contains the report.

## [report-metrics-trends] View metrics and trends
- Priority: low
- Status: not_started
- Tester:
- CompletedAt:
- Use Case: A tester can see metrics and recent run trends in the UI.
- Expected: Metrics cards and recent runs list are visible.
- Notes:
- FailureReason:
### Steps
- [ ] Open a manual run with history entries.
- [ ] Scroll to Advanced Reporting.
- [ ] Verify Total cases, Completion rate, and Latest status are displayed.
- [ ] Verify Recent runs list shows the latest entries.
- [ ] Verify browser console has no errors.
- [ ] Verify network/API requests have no failed calls.
- [ ] Verify metrics and trends display correctly.
