# Codemods

Codemods live in `src/transforms/<name>.ts` and export a function `(project: Project) => void` (named
`<name>`, its camelCase form, or the sole function export). They run on `ts-morph` `Project` instances.

## Running (`src/run.ts`)

```
bun src/run.ts <codemod> [...codemods] [--project=<spec>] [--dry]
```

- `--project=<spec>` (default `.`): resolved by `resolveProjectDir` — `~/...` under home, `.`/absolute/relative
  as-is, `repo/rest...` → `~/projects/repo/packages/rest...` (or `apps/rest...`/`repo/rest...` as fallback).
- `--dry`: print paths that would change instead of writing.

Always `--dry` first: `bun src/run.ts inlineExportStatements --project=. --dry`

## Testing against a corpus (`src/test.ts`)

```
bun src/test.ts <codemod> [...codemods]
```

Each codemod has fixtures at `corpus/<name>/input.ts` and `corpus/<name>/output.ts`, packing multiple virtual
files into one, delimited by `/* path.ts */` headers. `test.ts` seeds an in-memory project from `input.ts`,
runs the codemod(s), and diffs each result against `output.ts` (whitespace-normalized). Lines starting with
`///` in `output.ts` are annotations, stripped before comparison.

### Preamble commands

`input.ts` may start with a `/* ... */` preamble listing commands to play instead of the codemod(s) passed to
`test.ts`:

```
/*

- command: renameSymbol, args: ['foo', 'bar']
- command: renameSymbol, args: ['bar', 'foo']

*/
```

Each entry's `command` names a module in `src/commands/<command>.ts` (exporting a function named `<command>`,
its camelCase form, or `default`), called as `command(project, ...args)`. Commands run in order against the
same project. When `input.ts` has no such preamble, `test.ts` falls back to running the codemod(s) named on
the CLI, as before.

Output is a human-readable report — per-file status, and for failures a `-`/`+` diff:

```
FAIL inlineExportStatements (5/8)
  pass      src/basic.ts
  changed   src/types.ts
    ...
    - 
      export type Config = {
    ...
```
