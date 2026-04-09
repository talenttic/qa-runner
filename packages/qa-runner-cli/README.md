# @talenttic/qa-runner-cli

CLI entrypoint for QA Runner. It:
1. Starts the daemon + UI
2. Generates QA markdown suites and Playwright scaffolds
3. Runs report generation helpers

## When to Use
Use this package in **consumer projects** to run QA Runner without cloning the repo.

## Which Package Should I Use?
1. Run QA Runner in your project → `@talenttic/qa-runner-cli` (this package)
2. Serve UI + API → `@talenttic/qa-runner-daemon`
3. Extend logic → `@talenttic/qa-runner-core`
4. UI dev mode → `@talenttic/qa-runner-ui`

## How the Pieces Fit Together

```
CLI (this package)
  └── starts Daemon
        ├── uses Core
        └── serves UI
```

In most cases, **install only the CLI**.

## Dependencies / Requirements
1. Node.js 22+
2. `@talenttic/qa-runner-daemon` and `@talenttic/qa-runner-core` are installed transitively.

## Install

```bash
npm install -D @talenttic/qa-runner-cli
```

## Commands

Start daemon:

```bash
npx qa-runner daemon start
```

Generate QA suites + tests:

```bash
npx qa-runner generate --summary "..." --files src/... --mode manual|e2e|all
```

Generate deterministic output in CI:

```bash
npx qa-runner generate --summary "..." --files src/... --mode all --ci
```

## What It Does Not Do
1. It does not run your test runner directly.
2. It does not deploy or publish artifacts.

## Docs
Main repo: https://github.com/talenttic/qa-runner
