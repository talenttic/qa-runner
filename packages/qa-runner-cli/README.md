# @talenttic/qa-runner

CLI entrypoint for QA Runner. It:
1. Starts the daemon + UI
2. Generates QA markdown suites and Playwright scaffolds
3. Runs report generation helpers

## When to Use
Use this package in **consumer projects** to run QA Runner without cloning the repo.

## Which Package Should I Use?
1. Run QA Runner in your project → `@talenttic/qa-runner` (this package)
2. Serve UI + API → `@talenttic/qa-runner-daemon`
3. UI dev mode → `@talenttic/qa-runner-ui`

## How the Pieces Fit Together

```
CLI (this package)
  └── starts Daemon
        ├── uses core exports
        └── serves UI
```

In most cases, **install only the CLI**.

## Dependencies / Requirements
1. Node.js 22+
2. No additional QA Runner packages are required for local usage.

## Install

```bash
npm install -D @talenttic/qa-runner
```

## Commands

Start daemon:

```bash
npx qa-runner daemon start
```

Standalone demo UI (no daemon, sample data):

```bash
npx qa-runner demo
```

Generate QA suites + tests:

```bash
npx qa-runner generate --summary "..." --files src/... --mode manual|e2e|all --auto-test|--no-auto-test --healing=moderate
```

Generate deterministic output in CI:

```bash
npx qa-runner generate --summary "..." --files src/... --mode all --ci
```

Run tests with healing and validation gates:

```bash
npx qa-runner test --env stage --validate-manual-cases --report-healing-stats --validate-healing-rate 20%
```

Generate KPI report and enforce thresholds:

```bash
npx qa-runner report --kpi \
  --baseline-manifest tools/qa-runner.manifest.baseline.json \
  --enforce-kpi
```

## What It Does Not Do
1. It does not run your test runner directly.
2. It does not deploy or publish artifacts.

## Docs
Main repo: https://github.com/talenttic/qa-runner
