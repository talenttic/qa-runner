# @talenttic/qa-runner-ui

React UI for QA Runner. It provides:
1. Manual test execution UI (cases, steps, evidence, run history).
2. AI generation controls (generate suites, review, scaffold).
3. Collaboration, sharing, and reporting panels.

This package is **not a standalone product**. It is intended to be **served by the QA Runner daemon**, which supplies API data from your repo.

## When to Use
Use this when you want:
1. A local UI for running manual QA.
2. A UI to trigger AI-assisted QA generation.
3. A UI connected to your project’s `docs/qa-cases` folder.

## Which Package Should I Use?
1. Run QA Runner in your project → `@talenttic/qa-runner-cli`
2. Serve UI + API → `@talenttic/qa-runner-daemon`
3. Extend logic → `@talenttic/qa-runner-core`
4. UI dev mode → `@talenttic/qa-runner-ui` (this package)

## How the Pieces Fit Together

```
CLI
  └── starts Daemon
        ├── uses Core
        └── serves UI (this package)
```

## Dependencies / Requirements
1. Node.js 22+
2. QA Runner daemon running (for real data)
3. `@talenttic/qa-runner-daemon` and `@talenttic/qa-runner-core` are required by the full stack.

## Install

```bash
npm install -D @talenttic/qa-runner-ui
```

## Run (via daemon)

```bash
npx qa-runner daemon start
```

Then open:

```
http://localhost:4545/ui
```

## Dev (standalone UI)
Standalone mode is for **UI development only**. It uses sample data.

```bash
export VITE_API_URL=http://localhost:4545
npm run dev
```

## What It Does Not Do
1. It does not scan your repo by itself.
2. It does not write QA cases without the daemon.
3. It does not run tests directly (that’s handled by the daemon/CLI).

## Docs
Main repo: https://github.com/talenttic/qa-runner
Daemon package: https://www.npmjs.com/package/@talenttic/qa-runner-daemon
