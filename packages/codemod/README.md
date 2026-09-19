# @paladin/codemod

`ts-morph` codemods. Run everything from this package.

A codemod is `src/codemods/<name>.ts` exporting `(project: Project, ...args) => void`, named `<name>` (or `default`).

```
bun test                    # or: bun src/test.ts [name]  — test every corpus (run after any change)
bun src/cli.ts '{"dir":".","dry":true,"actions":[{"action":"renameSymbol","args":["Foo","Bar"]}]}'
```

## Running

`bun src/cli.ts '<json>'` takes `{ dir?, actions, dry? }`. Actions run in order, then the project is saved.

- `action` is a file name in `src/codemods/`; `args` are its positional arguments.
- `dry: true` lists the files that would change and writes nothing. Do that first.
- `dir` defaults to `.`; `repo/rest` means `~/projects/repo/packages/rest`.
- If the target's `package.json` has a `sanity` script, it runs after a real run.

## Corpus tests

`corpus/<name>/input.ts` and `output.ts` pack several virtual files, each starting with a `/* path.ts */` header.
`test.ts` runs the codemod on `input.ts` in memory and diffs each file against `output.ts`. `///` lines in `output.ts`
are comments, ignored. An empty expected file means "should be deleted".

- Several names (`a b`) run as a chain on one fixture, not as separate tests.
- With no preamble, the codemod named after the corpus runs with no arguments. Otherwise start `input.ts` with:

```
/*
- action: renameSymbol, args: ['foo', 'bar']
*/
```

- In failure diffs `-` is what the codemod produced and `+` is what `output.ts` expected.

To add a codemod: write `src/codemods/<name>.ts`, add `corpus/<name>/{input,output}.ts`, run `bun src/test.ts <name>`.
