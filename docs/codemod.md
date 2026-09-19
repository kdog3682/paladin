# Codemods

In `packages/codemod` (run everything below from there). A codemod is `src/codemods/<name>.ts` exporting
`(project: Project, ...args) => void`; the export is named `<name>`, its camelCase form, `default`, or is the sole
function export. Some take no arguments (`tidyTypes`, `inlineExportStatements`), some do (`renameSymbol`,
`extractSymbol`). They run on a `ts-morph` `Project`.

```
bun src/test.ts                                  # test every corpus (run after any change)
bun src/test.ts tidyTypes                        # test one corpus
bun src/run.ts tidyTypes --project=. --dry       # preview a no-argument codemod
bun src/cli.ts '{"dir":".","actions":[{"action":"renameSymbol","symbol":"Foo","to":"Bar"}]}'
```

## Running

**`src/run.ts <codemod> [...codemods] [--project=<spec>] [--dry]`** — no-argument codemods, run in order on one
project, then saved. `--dry` prints the paths that would change; do that first.

`--project` (default `.`) is resolved by `resolveProjectDir`: `~/...` under home, `.`/absolute/relative as-is,
`repo/rest...` → `~/projects/repo/packages/rest...` (fallbacks `apps/rest...`, `repo/rest...`).

**`src/cli.ts '<json>'`** — any codemod, with arguments. `{ dir, actions: [...], dry? }`; `dir` resolves like
`--project`, actions run in order:

```json
{ "dir": ".", "actions": [
  { "action": "renameSymbol", "symbol": "Foo", "to": "Bar" },
  { "action": "extractSymbol", "file": "src/a.ts", "symbol": "Foo", "newFile": "src/foo.ts" },
  { "action": "deleteSymbol", "args": ["ABC"] }
] }
```

`renameSymbol`, `renameFile`, `remapSymbol` and `extractSymbol` have named fields (see `ACTIONS` in `src/cli.ts`);
every other codemod takes a positional `args` array. After a non-dry run it runs the target's `sanity.test.ts`, if
any.

## Corpus tests (`src/test.ts`)

`corpus/<name>/input.ts` and `output.ts` each pack several virtual files, delimited by `/* path.ts */` headers.
`test.ts` loads `input.ts` into an in-memory project, runs the codemod, and diffs every file against `output.ts`
(whitespace-normalized). `///` lines in `output.ts` are annotations, stripped before comparing.

- No arguments: every corpus, then `N/N corpora passed`. Exit code is 0 only if all pass.
- Names: they are joined into one corpus path (`a.b.c`) and run as a chain over that single fixture, so **don't**
  pass several corpus names to test several corpora.
- A path (`src/codemods/tidyTypes.ts`, `corpus/tidyTypes/input.ts`) is reduced to its corpus name.
- An empty expected file means "should be deleted".

To add a codemod: write `src/codemods/<name>.ts`, add `corpus/<name>/{input,output}.ts`, run
`bun src/test.ts <name>`.

### Preamble

To run codemods with arguments (or several in sequence), start `input.ts` with a `/* ... */` preamble. Without one,
the codemod named after the corpus directory runs with no arguments.

```
/*

- command: renameSymbol, args: ['foo', 'bar']
- command: renameSymbol, args: ['bar', 'foo']

*/
```

### Reading a report

```
FAIL inlineExportStatements (5/8)
  pass      src/basic.ts
  changed   src/types.ts
    ...
    - 
      export type Config = {
```

Statuses: `pass`, `changed`, `missing`, `unexpected`, or `error: ...` if the fixture or codemod threw. In diffs `-` is
what the codemod produced and `+` is what `output.ts` expected; `...` elides unchanged lines. Console diagnostics
before a report (e.g. `relativizeSelfImports` logging which duplicate it picked) aren't failures.
