# Codemods

All of this lives in `packages/codemod` (run every command below from that directory). Everything operates on a
`ts-morph` `Project`.

There are two kinds of thing, both loaded by name from `src/`:

| Kind      | Location                | Signature                                | Purpose                                              |
| --------- | ----------------------- | ---------------------------------------- | ---------------------------------------------------- |
| transform | `src/transforms/<name>.ts` | `(project) => void`                   | Tidy-up passes that need no input (`tidyTypes`, `inlineExportStatements`, `relativizeSelfImports`, `inlineInfrequentConstants`, `destructureNullishDefaults`) |
| command   | `src/commands/<name>.ts`   | `(project, ...args) => void`          | Parameterized operations (`renameSymbol`, `renameFile`, `remapSymbol`, `extractSymbol`, `deleteSymbol`, `removeBarrel`) |

The module must export a function named `<name>`, its camelCase form, `default`, or be the sole function export.
Both run inside `withoutInsertedSemicolons`, so ts-morph edits don't introduce semicolons.

## Quick reference

```
bun src/test.ts                                  # test every corpus (do this after any change)
bun src/test.ts tidyTypes                        # test one corpus
bun src/run.ts tidyTypes --project=. --dry       # preview a transform on a project
bun src/run.ts tidyTypes --project=.             # apply it
bun src/cli.ts '{"dir":".","actions":[{"action":"renameSymbol","symbol":"Foo","to":"Bar"}]}'
```

Only transforms can be run with `run.ts` (it takes no arguments for the codemod). Commands take arguments, so they
go through `cli.ts` (or a corpus preamble, below).

## Running a transform (`src/run.ts`)

```
bun src/run.ts <codemod> [...codemods] [--project=<spec>] [--dry]
```

- Several codemods run in order against the same in-memory project, then the project is saved once.
- `--project=<spec>` (default `.`): resolved by `resolveProjectDir` — `~/...` under home, `.`/absolute/relative
  as-is, `repo/rest...` → `~/projects/repo/packages/rest...` (or `apps/rest...`/`repo/rest...` as fallback).
  The project uses the directory's `tsconfig.json` if present, otherwise globs its source files.
- `--dry`: print paths that would change instead of writing. Always `--dry` first:
  `bun src/run.ts inlineExportStatements --project=. --dry`
- Ends with `N file(s) changed` (or `would change`).

## Running commands (`src/cli.ts`)

Takes one JSON spec: `dir` (same resolution as `--project`), an ordered list of `actions`, and optional `dry`.

```
bun src/cli.ts '{
  "dir": "./src",
  "actions": [
    { "action": "renameSymbol", "symbol": "Foo", "to": "Bar" },
    { "action": "renameFile", "file": "src/a.ts", "to": "src/b.ts" },
    { "action": "extractSymbol", "file": "src/a.ts", "symbol": "Foo", "newFile": "src/foo.ts" }
  ]
}'
```

- `renameSymbol`, `renameFile`, `remapSymbol`, `extractSymbol` have named fields (see `ACTIONS` in `src/cli.ts`).
- Any other command (e.g. `deleteSymbol`, `removeBarrel`) works with positional `args`:
  `{ "action": "deleteSymbol", "args": ["ABC"] }`.
- After a non-dry run, `cli.ts` runs `sanity.test.ts` in the target dir if one exists, and exits 1 if it fails.

## Testing against a corpus (`src/test.ts`)

```
bun src/test.ts                       # every corpus/<name>/ directory, one report each, then "N/N corpora passed"
bun src/test.ts <name>                # a single corpus
bun src/test.ts <codemod> <codemod>   # several transforms chained against ONE corpus (see caveat)
```

- Exit code is 0 only if everything passes.
- **Don't pass many corpus names to test several corpora.** Multiple names are joined into one corpus path
  (`a.b.c`) and run as a chain of transforms over that single fixture. To test everything, pass no arguments.
- An argument may also be a path (`src/transforms/tidyTypes.ts`, `corpus/tidyTypes/input.ts`); it's reduced to the
  corpus name.

### Fixture format

Each corpus lives in `corpus/<name>/input.ts` and `corpus/<name>/output.ts`, packing multiple virtual files into one,
delimited by `/* path.ts */` headers. `test.ts` seeds an in-memory project from `input.ts`, runs the codemod(s), and
diffs each result against `output.ts` (whitespace-normalized). Lines starting with `///` in `output.ts` are
annotations, stripped before comparison — use them to explain why an output looks the way it does.

A file present in the result but absent from `output.ts` is `unexpected`; one in `output.ts` but deleted from the
result is `missing` (unless its expected content is empty, which means "should be deleted").

To add a codemod: write `src/transforms/<name>.ts`, create `corpus/<name>/{input,output}.ts`, run
`bun src/test.ts <name>`.

### Preamble commands

`input.ts` may start with a `/* ... */` preamble listing commands to play instead of the codemod named by the
corpus. This is how commands (which need arguments) are tested:

```
/*

- command: renameSymbol, args: ['foo', 'bar']
- command: renameSymbol, args: ['bar', 'foo']

*/
```

Each entry's `command` names a module in `src/commands/<command>.ts`, called as `command(project, ...args)`.
Commands run in order against the same project. With no preamble, the codemod(s) named on the CLI run instead
(for `test.ts` with no arguments, the corpus directory name is the transform name).

### Reading a report

```
FAIL inlineExportStatements (5/8)
  pass      src/basic.ts
  changed   src/types.ts
    ...
    - 
      export type Config = {
    ...
```

- Header is `PASS|FAIL <corpus> (passed/total files)`.
- Status per file: `pass`, `changed` (content differs), `missing`, `unexpected`.
- Diff legend: `-` is what the codemod produced (received), `+` is what `output.ts` expected; unchanged context is
  elided with `...`.
- A fixture that throws (bad header, missing `output.ts`, codemod error) shows up as an `error: ...` status.
- Some codemods print diagnostics to the console before the report (e.g. `relativizeSelfImports` logs which
  duplicate it picked). These are not failures.
