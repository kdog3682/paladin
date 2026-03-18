

## Guides
- It is important to avoid hacky solutions. for example, prefer a dedicated script file over long inline `bun -e` commands in `package.json`.
- Use conventional git commits that are succinct (e.g. `feat: add new feature`, `fix: resolve bug`).
- Include the package name when relevant (e.g. `feat(conversation): add new feature`).
- ALWAYS do atomic commits - one logical change per commit. Don't group unrelated changes together.

## Conventions
- /mnt/chromeos/MyFiles/Downloads is the 'dldir'
- ~/scratch is the 'scratchdir'

## Memory Notes
- Anytime asked to "note" or "remember" something, add it to `AGENTS.md`.

## Refactoring Pattern
- When refactoring code into separate files, ALWAYS run tests BEFORE and AFTER the refactoring.
- If the initial test fails, DO NOT proceed with the refactoring. Fix the test first or investigate the failure.
- This ensures the refactoring doesn't introduce regressions.

## Debug Scripts
- `scripts/debug-frontend-test.py` - Gathers debug files for frontend test failures in @paladin/conversation package, opens output in browser
