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

2. Start daemon + UI:

```bash
npx qa-runner daemon start
```

3. Open:

```text
http://localhost:4545/ui
```

4. Generate artifacts:

```bash
npx qa-runner generate --mode all --env stage
```

5. Run test command + healing stats:

```bash
npx qa-runner test --env stage --report-healing-stats
```

6. KPI report:

```bash
npx qa-runner report --kpi --baseline-manifest tools/qa-runner.manifest.baseline.json
```

## Important Runtime Behavior

1. `qa-runner test` runs `tests.command` from `tools/qa-runner.config.js` when provided.
2. If no `tests.command` is configured and `e2e/ui/package.json` is missing, the test runner step is skipped cleanly.
3. AI auto-testing, self-healing, and flakiness are controlled by `tools/qa-runner.config.js`.

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
```

## Release

See `RELEASE.md`.
