# @talenttic/qa-runner

Primary package for consumers. This provides the `qa-runner` CLI and includes the consolidated local QA stack.

## Install

```bash
npm install -D @talenttic/qa-runner
```

## What It Does

1. Starts daemon + serves UI.
2. Generates manual guides and Playwright scaffolds.
3. Runs AI auto-testing + flakiness/healing tracking.
4. Produces standard report and KPI report.

## Feature Scope (Implemented)

1. `self-healing`:
   - selector recovery chain
   - retry budgeting/strategy
   - healing summary in manifest
2. `ai mode / auto-testing`:
   - manual-step interpretation
   - confidence scoring
   - `*.ai-validation.json`, execution/plan artifacts
3. `flakiness`:
   - pass/fail pattern tracking
   - flake score + unstable status
   - category grouping (`timing|selector|assertion`)
4. `kpi`:
   - `report --kpi`
   - optional enforcement via `--enforce-kpi`

## Commands

```bash
npx qa-runner daemon start|stop|status --port 4545
npx qa-runner ui --port 4545
npx qa-runner demo --port 4546
npx qa-runner generate --summary "..." --files src/a.ts,src/b.ts --mode manual|e2e|all --env dev|stage|prod --auto-test|--no-auto-test --healing=aggressive|moderate|conservative --ci --diff "<git diff>"
npx qa-runner test --env stage|prod --auto-test|--no-auto-test --healing=aggressive|moderate|conservative --validate-manual-cases --report-healing-stats --validate-healing-rate 20%
npx qa-runner report
npx qa-runner report --kpi --baseline-manifest tools/qa-runner.manifest.baseline.json --ai-validation-root e2e/generated --enforce-kpi
```

## Config

Use `tools/qa-runner.config.js` to configure:
1. Skill toggles (`selfHealing`, `aiAutoTester`, `flakinessDetector`, etc.)
2. Environment defaults (`dev`, `stage`, `prod`)
3. Optional `tests.command` for `qa-runner test`

## Test Command Behavior

1. If `tests.command` is configured, CLI executes it.
2. If `tests.command` is not configured and `e2e/ui/package.json` is missing, CLI skips runner execution and still reports healing stats.

## Docs

Main repo: https://github.com/talenttic/qa-runner
