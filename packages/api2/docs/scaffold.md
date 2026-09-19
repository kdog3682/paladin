# Scaffold pipeline

How a dropped file becomes files on disk. Code: `src/services/scaffold/`. The runner stage has its own doc: [runner.md](./runner.md).

## Entry points

- `src/server.ts` — Hono. `POST /controller {method, kwargs}` → `ScaffoldService.dispatch` (table in `scaffold/commands/`); `/ws` websocket via `broadcast.ts`; `/images/*` static. Needs `DOWNLOAD_DIR`, `PORT` defaults to 3000.
- `src/watcher.ts` — watches `DOWNLOAD_DIR`, waits for each new file's size to settle, then groups files that trickle in: the batch is flushed to `scaffold.process(paths)` only after `groupWaitMs` (default 1500) with no new arrival, and every arrival restarts that wait.
- `src/cli.ts` — one-shot: scaffolds the newest `.zip`/`.ts` in `~/scratch`.
- `src/hot.ts` — `keep`/`replace`/`onSignal` registry on `globalThis` so state survives hot reloads. `src/services/git.ts` — `git` wrapper. `src/commands/registerBin.ts` — adds a file as a `bin` and `bun link`s it.
- Tests: `bun test` from this package.

## `ScaffoldService.process(input)` (`scaffold.ts`)

`input` is one source or an array of them; an array is planned as a single batch.

**Nothing touches disk until the last step.** Every stage only appends `FsOp`s to `unit.ops`, so each stage sees the world as it is plus what the earlier stages intend.

1. **plan** (`plan/`) — `readSources` (zip via fflate, a single file, or a text blob split on path-comment headers) → `parseFileContent` (one op per file) → `groupOps` (ops → `Project` → `Unit[]`).
2. **per unit, in order** — `postProcessors` → `hydrateBoilerplate` → `resolveDependencies` → `CodeRunner.run`.
3. **apply** (`apply.ts`) — `mergeOps` folds and orders everything, then executes it.
4. optional `git init`, then `emit(result)`. `defaultEmit` is `print` (`print.ts`), which copies errors, artifacts, or command output to the clipboard via `clip`. Pass `emit` to override.

Options (`ScaffoldServiceOptions`): `pathResolution` (`base` defaults to `~/projects`, `relativeTo`, `npmCachePath`), `emit`, `codeRunner`, `postProcessorOptions`, `git`.

## Input format

The first line of each file is a path comment (after an optional shebang): `// @scope/pkg/src/foo.ts`; `#`, `/* */` and `<!-- -->` work too.
It resolves through `resolveScopedPath` (`@paladin/utils`): `@scope/pkg/x.ts` → `<base>/scope/packages/pkg/src/x.ts`. Root files such as `package.json` or `tsconfig.json` land in the package root instead of `src/`.
A `package.json` with no header addresses itself by its `name` field.

Suffix markers on the header: `(append)`, `(merge)`, `(delete)`, `(deprecated)`. The word "deprecated" in the first 3 lines also counts.
No marker: `write` when the file is new or differs from disk, `skip` when identical.
`append`/`merge` fall back to `write` when the file doesn't exist; `delete` of a missing file becomes `deprecated`.

## Model (`types.ts`, builders in `ops.ts`)

- `FsOp` kinds: `write` (mode `write|append|merge`), `bash` (`purpose` install|test|demo|example|script|build, `strict`), `delete`, `skip`, `deprecated`. Every op carries `source` (the stage that emitted it); apply adds `applied`/`reason`.
- Build ops with `write/append/merge/remove/skip/deprecate/bashOp`; narrow with `isWrite/isBash/...`.
- `Project` → `Unit[]`. A unit is `packages/<name>/` of the project, or the project root for everything else (`groupOps.ts`). The first op decides the project. `isNew` means the dir doesn't exist yet.
- `merge` mode: JSON deep-merges; anything else goes through `codeMerge` (`@paladin/codegen`).

## Apply (`apply.ts`)

`mergeOps(project)`:
- deprecated paths drop out; skips never make it out;
- per-path ops `fold`: a `write` resets, `append`/`merge` stack on top, `delete` clears; the latest intent wins;
- duplicate bash ops (same cwd + args) collapse;
- a delete of something being written (or an ancestor of it) is discarded;
- order: deletes, writes, then bash sorted by `BASH_ORDER` (install, test, demo, example, script, build).

`applyOperations` then executes in that order. A `strict` bash op that exits non-zero blocks every later bash op in the project (`blocked by ...`); files are already written by then.
The returned `ApplyResult` groups ops per unit; paths and cwds are relative to the unit's `dir` (which is absolute), plus a `summary` of created/updated/deleted/commands/failed.

## Stages

- `postProcessors/updateBarrel.ts` — appends `export * from "./x"` to `src/index.ts` for **new** source files that count as entries. Rules and options are in `postProcessors/types.ts`; scope comes from `DEFAULT_OPTIONS.postProcessorOptions` in `scaffold.ts` (`matches` currently `packages/utils`, `packages/ui`; empty `matches` means every unit).
  Never barrels runnable files (`runnableKind`), `src/test/`, non-`src/` files, or files under a folder that already owns an entry.
- `postProcessors/deleteShadowedFiles.ts` — deletes `foo/` when the unit now owns `foo.ts` without writing under it, and `foo.ts` when the unit writes into `foo/`.
- `hydrateBoilerplate/` — for a new project or unit, writes files from `templates/*.tpl` (blocks separated by `===`, path, `===`; `{{PROJECT_NAME}}`, `{{PACKAGE_NAME}}`). The unit template is picked by extension: `.astro` → `astro`; `.tsx`/`.jsx` → `react` for units named `web`/`web2`, else `react-peer`; otherwise `typescript`. Never overwrites an existing path or one the project's ops already claim.
- `deps/resolveDependencies.ts` — scans imports of written `.ts`/`.tsx`, emits a `merge` op on the unit's `package.json` for undeclared deps (test files → `devDependencies`), a `merge` op for versions newly learned into the cache file (`npm-dependencies.json` at the repo root, `deps/versions.ts`), and a strict `bun install` at the project root.
  Specs (`deps/localSpec.ts`): same scope as the project → `workspace:*`; another project that exists under `base` → `file:` relative path; otherwise `^latest` from the npm registry.

## Tests

- `scaffold.test.ts` — end to end in a temp `base` (real disk, real `bun test` runs).
- `runner.test.ts` — `CodeRunner` in isolation; `deps/resolveDependencies.test.ts`; `commands/index.test.ts`; `src/test/updateBarrel.mergeJson.test.ts`.
- `scaffold.examples.ts` — sample inputs walked through the service, with expected behavior in comments.
