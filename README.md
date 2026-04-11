# QA Runner

QA Runner is a local-first QA platform for:
1. Manual QA execution in a local UI.
2. AI-assisted generation/validation of QA suites.
3. Flakiness + healing tracking and KPI reporting.

Cloud is intentionally split out of this repo. `@talenttic/qa-runner-cloud` is managed separately.

## Install Model (Current)

For consumers, install only:

```bash
npm install -D @talenttic/qa-runner
```

`@talenttic/qa-runner` is the CLI entrypoint and includes what you need to run daemon/UI workflows.

## Monorepo Packages

1. `@talenttic/qa-runner` (CLI + core + daemon wiring)
2. `@talenttic/qa-runner-daemon` (daemon re-export package)
3. `@talenttic/qa-runner-ui` (UI bundle + UI dev tooling)

## Implemented Features (Current)

1. Manual QA suite generation (`docs/qa-cases`).
2. Playwright scaffold generation (`e2e/generated`).
3. Self-healing system (selector recovery strategies + retry orchestration + manifest tracking).
4. AI auto-testing mode (step interpretation, confidence scoring, validation artifacts).
5. Flakiness detection/reporting (per-case score, unstable flag, category breakdown).
6. Runtime environment controls (`dev|stage|prod`, CLI overrides).
7. KPI reporting + gating:
   - self-healing reduction KPI
   - manual guide confidence KPI

## Quickstart (Consumer Project)

1. Install:

```bash
npm install -D @talenttic/qa-runner
```

2. Create local env file:

```bash
cp .env.example .env
```

3. Start daemon + UI:

```bash
npx qa-runner daemon start
```

4. Open:

```text
http://localhost:4545/ui
```

5. Generate artifacts:

```bash
npx qa-runner generate --mode all --env stage
```

6. Run test command + healing stats:

```bash
npx qa-runner test --env stage --report-healing-stats
```

7. KPI report:

```bash
npx qa-runner report --kpi --baseline-manifest tools/qa-runner.manifest.baseline.json
```

## Important Runtime Behavior

1. `qa-runner test` runs `tests.command` from `tools/qa-runner.config.js` when provided.
2. If no `tests.command` is configured and `e2e/ui/package.json` is missing, the test runner step is skipped cleanly.
3. AI auto-testing, self-healing, and flakiness are controlled by `tools/qa-runner.config.js`.
4. Manual AI execution mode is controlled by `QA_RUNNER_PLAYWRIGHT_EXECUTION_MODE` and supports `stub|shell|ui|mcp` (default `mcp`).
5. MCP runtime supports both transports:
   - `QA_RUNNER_PLAYWRIGHT_MCP_TRANSPORT=http` with `QA_RUNNER_PLAYWRIGHT_MCP_URL`
   - `QA_RUNNER_PLAYWRIGHT_MCP_TRANSPORT=stdio` with `QA_RUNNER_PLAYWRIGHT_MCP_COMMAND` and `QA_RUNNER_PLAYWRIGHT_MCP_ARGS`
   - Default MCP args are `-y @playwright/mcp@0.0.70 --browser chromium` (headed by default unless `--headless` is added).
6. MCP health endpoint:
   - `GET /plugin/qa/mcp/health` returns last known MCP status.
   - `GET /plugin/qa/mcp/health?probe=1` performs an active MCP connectivity probe.

## MCP Troubleshooting

1. `mcp_connect_timeout: fetch failed`
   - Usually transport startup/connect race. Probe with `GET /plugin/qa/mcp/health?probe=1`.
2. `mcp_process_exited: 1` with browser profile lock
   - Ensure MCP args include `--isolated` so runs do not share profile state.
3. `mcp_http_404: Session not found`
   - Session expired/reset; rerun. Client now auto-recovers session on 404.
4. `Ref ... not found in the current page snapshot`
   - Snapshot ref went stale between read and click; re-snapshot + retry click (built into manual executor).
5. No visible browser window while in MCP mode
   - Headed mode requires a desktop display server. In headless/server environments (`DISPLAY` empty on Linux), execution is headless even when browser actions succeed.
6. Route mismatch errors like navigating to `/the%20QA%20Runner%20UI`
   - Use `Open base URL` in manual DSL steps instead of prose route text.

## Recommended Config File

Create `tools/qa-runner.config.js` (example shape):

```js
module.exports = {
  skills: {
    manualGuide: { enabled: true },
    e2eScaffold: { enabled: true },
    selfHealing: { enabled: true, strategy: "moderate", retryBudget: 5 },
    aiAutoTester: { enabled: true, confidenceThreshold: 0.7, executionMode: "simulated" },
    flakinessDetector: { enabled: true, unstableThreshold: 0.2 },
  },
  environments: {
    dev: { autoTest: { enabled: true }, healing: { strategy: "aggressive", retryBudget: "unlimited" } },
    stage: { autoTest: { enabled: true }, healing: { strategy: "moderate", retryBudget: 5 } },
    prod: { autoTest: { enabled: false }, healing: { strategy: "conservative", retryBudget: 2 } },
  },
  tests: {
    command: "npm --prefix e2e/ui test",
  },
};
```

## CLI Commands

```bash
qa-runner daemon start|stop|status --port 4545
qa-runner ui --port 4545
qa-runner demo --port 4546
qa-runner generate --summary "..." --files a.ts,b.ts --mode manual|e2e|all --env dev|stage|prod --auto-test|--no-auto-test --healing=aggressive|moderate|conservative --ci --diff "<git diff>"
qa-runner test --env stage|prod --auto-test|--no-auto-test --healing=aggressive|moderate|conservative --validate-manual-cases --report-healing-stats --validate-healing-rate 20%
qa-runner report
qa-runner report --kpi --baseline-manifest tools/qa-runner.manifest.baseline.json --ai-validation-root e2e/generated --enforce-kpi
```

## Repo Scripts

From repo root:

```bash
npm run qa:daemon
npm run qa:ui
npm run qa:generate
npm run qa:test
npm run qa:report
npm run qa:kpi
npm run qa:kpi:enforce
npm run qa:demo
npm run dev:all
npm run fixtures:dogfood:node
npm run fixtures:dogfood:react
npm run fixtures:dogfood
```

`npm run dev:all` starts:
1. Daemon API/UI backend on `http://localhost:4545` (`tsx watch` live reload for CLI/daemon source edits)
2. UI Vite dev server (hot reload) on `http://localhost:2173`

You can override UI dev port with `QA_RUNNER_UI_DEV_PORT`, for example:
`QA_RUNNER_UI_DEV_PORT=3173 npm run dev:all`.
`dev:all` also auto-sets:
1. `VITE_API_URL=http://localhost:4545`
2. `QA_RUNNER_CORS_ORIGIN=http://localhost:2173`
3. Preflight checks for daemon/UI ports and exits early with a clear message if either port is already occupied.

## Fixture App Dogfood

This repo includes two fixture apps to validate module behavior as a consumer would use it:

1. `fixtures/node-api` (Express login app)
2. `fixtures/react-web` (Vite + React login app)

Each fixture has:
1. `tools/qa-runner.config.js` enabling `manualGuide`, `e2eScaffold`, `selfHealing`, `aiAutoTester`, and `flakinessDetector`.
2. `e2e/ui` Playwright tests, including an intentional one-time flaky case for healing retries.
3. Manual QA markdown for the manual AI checklist executor.

Run full local dogfood on a fixture:

```bash
npm run fixtures:dogfood:node
npm run fixtures:dogfood:react
```

The runner script (`scripts/run-fixture-dogfood.mjs`) installs a packed tarball of `@talenttic/qa-runner` into the fixture, starts the app + daemon, runs generation/tests, and validates manual AI execution end-to-end.

## Release

See `RELEASE.md`.
