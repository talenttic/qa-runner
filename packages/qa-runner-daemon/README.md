# @talenttic/qa-runner-daemon

Local daemon that powers QA Runner. It:
1. Serves the UI at `http://localhost:4545/ui`.
2. Reads/writes QA suites from your repo (`docs/qa-cases` by default).
3. Stores run data in a local SQLite DB.
4. Exposes API endpoints for the UI and CLI.

## When to Use
Run the daemon whenever you want the UI to show **real data** and persist runs.

## Which Package Should I Use?
1. Run QA Runner in your project → `@talenttic/qa-runner`
2. Serve UI + API → `@talenttic/qa-runner-daemon` (this package)
3. Extend logic → `@talenttic/qa-runner` (core exports)
4. UI dev mode → `@talenttic/qa-runner-ui`

## How the Pieces Fit Together

```
CLI
  └── starts Daemon (this package)
        ├── uses core exports
        └── serves UI
```

## Dependencies / Requirements
1. Node.js 22+
2. Local filesystem access to your repo
3. `@talenttic/qa-runner` (internal dependency)
4. `@talenttic/qa-runner-ui` (served UI bundle)

## Install

```bash
npm install -D @talenttic/qa-runner-daemon
```

## Run

```bash
npx qa-runner daemon start
```

Open:

```
http://localhost:4545/ui
```

## Configuration
Common settings live in:

```
tools/qa-runner.config.js
```

Custom test types:

```
tools/qa-runner.plugins.json
```

## What It Does Not Do
1. It does not run CI pipelines.
2. It does not publish to npm.
3. It does not replace your test runner — it orchestrates QA artifacts and UI state.

## Docs
Main repo: https://github.com/talenttic/qa-runner
