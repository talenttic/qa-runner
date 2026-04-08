# @talenttic/qa-runner-cli

CLI entrypoint for QA Runner (manual testing + AI-assisted QA generation).

## Install

```bash
npm install -D @talenttic/qa-runner-cli
```

## Usage

Start the daemon (serves UI on `http://localhost:4545/ui`):

```bash
npx qa-runner daemon start
```

Generate QA artifacts:

```bash
npx qa-runner generate --summary "..." --files src/... --mode all
```

## Docs

Main repo: https://github.com/talenttic/qa-runner
