# QA Runner Fixtures

Fixture apps used to dogfood `@talenttic/qa-runner` as a consumer package.

## Apps

1. `node-api`: Express-based login flow.
2. `react-web`: Vite + React login flow.

## Run

From repo root:

```bash
npm run fixtures:dogfood:node
npm run fixtures:dogfood:react
```

These flows validate:

1. QA generation (`qa-runner generate`)
2. AI auto-testing artifacts
3. Self-healing retry path (`qa-runner test` with intentional flaky test)
4. Flakiness tracking in manifest
5. Manual AI checklist execution through daemon endpoints
