# Writing a recast spec

Specs live in `packages/recast/src/specs/<name>.ts` and are picked up automatically by the
scaffold's `codeRunner` (matched by directory, run via `bun run @paladin/recast/runner.ts <path>`).

A spec is duck-typed — no import from the runner — and exports:

- `args: { dir: string | string[], glob?: string, dry?: boolean, print?: recast.Options }`
  — `dir` is required; `glob` defaults to `**/*.{ts,tsx,js,jsx,mts,cts}`.
- `transform(ast): number` — mutate the recast AST in place, return the edit count. A
  return of `0` means "no changes" and the file is left untouched.

Start every spec file with a `// path/to/spec.ts` comment giving its own path, so the file
is self-identifying if it's ever copied, pasted into a message, or read out of context.

Use `recast.types.builders`/`recast.types.visit` for AST work; the runner reparses/reprints
with recast, so untouched code keeps its original formatting.

Run directly: `bun run @paladin/recast/runner.ts <spec> [--dry]` (`--dry` prints, doesn't write).
