# Legacy CI Notes (v1)

**Date**: April 10, 2026  
**Purpose**: Audit trail for the v1 CI steps removed during v2 consolidation.

## Legacy CI Steps (Removed)

- Build: `@talenttic/qa-runner-core`
- Build: `@talenttic/qa-runner-cli`
- Test: `@talenttic/qa-runner-core`
- Publish: `@talenttic/qa-runner-core`
- Publish: `@talenttic/qa-runner-cli`

## Replacement (v2)

- Build/Test/Publish now use `@talenttic/qa-runner` as the consolidated local package.
- Daemon/UI remain separate deployment units.
