# @paladin/codemod

`ts-morph` codemods. Run everything from this package.

A codemod is `src/codemods/<name>.ts` exporting `(project: Project, ...args) => void`, named `<name>` (or `default`).

```
bun test # or: bun src/test.ts [name]  — test every corpus (run after any change)
bun src/cli.ts '{"dir":".","dry":true,"actions":[{"action":"renameSymbol","args":["Foo","Bar"]}]}'
```

## Running

`bun src/cli.ts '<json>'` takes `{ dir?, actions, dry? }`. Actions run in order, then the project is saved.

- `action` is a file name in `src/codemods/`; `args` are its positional arguments.
- `dry: true` lists the files that would change and writes nothing. Do that first.
- `dir` defaults to `.`; `repo/rest` means `~/projects/repo/packages/rest`.
- If the target's `package.json` has a `sanity` script, it runs after a real run.

