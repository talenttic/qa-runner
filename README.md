# QA Runner

QA Runner is a local-first QA workflow for manual testing and AI-assisted generation of QA suites.  
You get:
1. A local UI for executing manual test runs.
2. AI-assisted generation of QA markdown suites and Playwright scaffolds.
3. A lightweight daemon that reads/writes test suites inside your repo.

> Package scope note: `@talenttic/*` is the current scope for this repo.

## What You Install

For manual testing + AI generation, you need:
1. `@talenttic/qa-runner-cli` (entrypoint command)
2. `@talenttic/qa-runner-daemon` (API + file access)
3. `@talenttic/qa-runner-ui` (UI bundle)
4. `@talenttic/qa-runner-core` (internal dependency)

Not needed right now:
1. `@talenttic/qa-runner-cloud` (not ready)
2. `qa-runner-vscode` (VS Code marketplace, not npm)

## Package Roles (What Each One Is For)

1. **core** (`@talenttic/qa-runner-core`)
   - Generation logic, validation, and shared types.
   - No UI, no server. Used internally by daemon + CLI.

2. **daemon** (`@talenttic/qa-runner-daemon`)
   - Local server for the UI and API.
   - Reads/writes `docs/qa-cases`, stores runs in SQLite.

3. **cli** (`@talenttic/qa-runner-cli`)
   - User entrypoint: starts daemon/UI and runs generation commands.
   - What most users install in their project.

4. **ui** (`@talenttic/qa-runner-ui`)
   - Frontend UI for manual runs + AI generation.
   - Served by the daemon in real usage.

## Prereqs
1. Node.js 22+

## Quickstart (Consumer Project)

From your project repo:

```bash
npm install -D @talenttic/qa-runner-cli
```

Start the daemon (this also serves the UI):

```bash
npx qa-runner daemon start
```

Open the UI:

```
http://localhost:4545/ui
```

If you want to run the UI separately (Vite dev server, repo only):

```bash
export VITE_API_URL=http://localhost:4545
cd packages/qa-runner-ui
npm run dev
```

## Dev Quickstart (Repo)

```bash
npm install
npm run build
```

Standalone UI (demo data):

```bash
cd packages/qa-runner-ui
npm run dev
```

### Standalone UI (Demo Mode)

You can run the UI without the daemon (sample data will appear):

```bash
cd packages/qa-runner-ui
npm run dev
```

To connect the standalone UI to a daemon, set:

```bash
export VITE_API_URL=http://localhost:4545
npm run dev
```

### Custom Test Types (Plugin Config)

Define custom AI test types in:

```
tools/qa-runner.plugins.json
```

Example:

```json
{
  "types": [
    {
      "id": "performance_smoke",
      "label": "Performance Smoke",
      "description": "Quick performance sanity checks.",
      "details": "Runs lightweight performance assertions focused on startup and critical flows."
    }
  ]
}
```

Restart the daemon after editing the file.

### GitHub Issues Integration

To create GitHub issues from QA Runner:

1. Create a GitHub PAT with `repo` scope.
2. Export the token before starting the daemon:

```bash
export QA_RUNNER_GITHUB_TOKEN=ghp_...
npx qa-runner daemon start
```

UI location: `QA Runner → GitHub Issue` section inside a manual run.

## Generate Artifacts (One-Shot)

```bash
npx qa-runner generate --summary "Added settings form" --files src/... --mode all
```

## Generate In CI Mode (Deterministic)

```bash
npx qa-runner generate --summary "..." --files src/... --mode all --ci
```

## Run Tests + Report

```bash
npx qa-runner test
npx qa-runner report
```

## E2E (Playwright) Notes

Generated Playwright specs and POMs land in:

```
e2e/generated
```

To run the UI E2E suite (from the target repo):

```bash
npm --prefix e2e/ui test
```

## Config

Configure per-repo settings in:

```
tools/qa-runner.config.js
```

## CLI Usage (Direct)

```bash
qa-runner daemon start
qa-runner ui
qa-runner generate --summary "..." --files a.ts,b.ts --mode manual|e2e|all --ci
qa-runner test --env stage
qa-runner report
```

## Release (npm via GitHub Actions)

The repo publishes to npm on tag pushes matching `v*.*.*`.

Required GitHub secret:
1. `NPM_TOKEN` (npm automation token with access to `@talenttic`)

Release steps:
1. `git tag v0.1.0`
2. `git push origin v0.1.0`

### Versioning (Changesets)

This repo uses Changesets to bump versions before tagging.

Workflow:
1. `npm run changeset` (select packages + bump type)
2. `npm run version-packages`
3. Commit the version bumps
4. Tag and push (example: `v0.1.0`)

CI:
1. A PR check requires a changeset.
2. On main, a Changesets version PR is created automatically.
3. On main, Changesets can publish to npm when versions are present.
