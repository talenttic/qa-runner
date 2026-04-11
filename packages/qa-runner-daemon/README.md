# @talenttic/qa-runner-daemon

Daemon package for QA Runner local server behavior (API + UI serving).

## Important

For most users, install and run `@talenttic/qa-runner` only.  
This package exists as a deployment/library unit and is generally not needed directly in consumer projects.

## What The Daemon Handles

1. Serves UI at `/ui`.
2. Reads/writes QA suite files.
3. Stores run data in local SQLite.
4. Exposes API endpoints used by UI/CLI.

## Typical Run Path

```bash
npx qa-runner daemon start
```

Then open:

```text
http://localhost:4545/ui
```

## Configuration

`tools/qa-runner.config.js`

Custom test type registry:

`tools/qa-runner.plugins.json`

## Docs

Main repo: https://github.com/talenttic/qa-runner
