# Release Process

- Versioning: SemVer
- Packages are versioned together for now.

## Goal
Keep `main` always releasable while preventing accidental broken publishes.

## Required Checks (PR Gate)
Every PR to `main` must pass:
1. `npm run build`
2. `npm run test -w @talenttic/qa-runner-core`
3. `npm run -w @talenttic/qa-runner-ui test:run`
4. `npm run -w @talenttic/qa-runner-ui size-limit`

## Changesets (Versioning)
Use Changesets to track release intent:
1. `npm run changeset`
2. `npm run version-packages`
3. Commit the version bumps

## Release Options
### Option A: Changesets Publish (recommended)
1. Merge the Changesets version PR into `main`.
2. The `Changesets Publish` workflow publishes automatically.

### Option B: Tag Release (manual control)
1. Ensure `main` is green and reviewed.
2. `git tag vX.Y.Z`
3. `git push origin vX.Y.Z`
4. The tag-based workflow publishes.

## Pre-release (optional)
Use pre-release tags for safer validation:
1. `npx changeset pre enter beta`
2. `npm run changeset`
3. `npm run version-packages`
4. `git push`
5. Publish pre-release builds and validate in a real project
6. `npx changeset pre exit` when ready for stable

## Sanity Checklist Before Publishing
1. CI is green on `main`.
2. No pending breaking migrations.
3. Install in a clean test project and confirm:
   - `npx qa-runner daemon start` works
   - UI loads at `http://localhost:4545/ui`
   - Manual run can start and save results
4. Release notes / changeset describes user impact.
