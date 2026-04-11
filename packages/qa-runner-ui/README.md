# @talenttic/qa-runner-ui

UI package for QA Runner.

## Important

Most users should not install this package directly.  
Install `@talenttic/qa-runner` and use the daemon-served UI.

## Run With Real Data

```bash
npx qa-runner daemon start
```

Open:

```text
http://localhost:4545/ui
```

## Standalone Demo

```bash
npx qa-runner demo
```

## UI Dev Mode (repo maintainers)

```bash
export VITE_API_URL=http://localhost:4545
npm run dev
```

## Scope

1. Manual QA execution views.
2. AI generation/validation controls.
3. Flakiness and runtime status surfaces via daemon API.

## Docs

Main repo: https://github.com/talenttic/qa-runner
