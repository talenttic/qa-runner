# @talenttic/qa-runner-core

Core library for QA Runner. It provides:
1. QA generation logic (markdown + Playwright scaffolds)
2. Validation utilities
3. Shared types and adapters

This is **primarily internal** and used by:
- `@talenttic/qa-runner-cli`
- `@talenttic/qa-runner-daemon`

## Install

```bash
npm install @talenttic/qa-runner-core
```

## Use Cases
If you are building custom tooling on top of QA Runner, you can import core APIs directly.

## Which Package Should I Use?
1. Run QA Runner in your project → `@talenttic/qa-runner-cli`
2. Serve UI + API → `@talenttic/qa-runner-daemon`
3. Extend logic → `@talenttic/qa-runner-core` (this package)
4. UI dev mode → `@talenttic/qa-runner-ui`

## How the Pieces Fit Together

```
CLI
  └── starts Daemon
        ├── uses Core (this package)
        └── serves UI
```

## Docs
Main repo: https://github.com/talenttic/qa-runner
