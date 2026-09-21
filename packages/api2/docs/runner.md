# CodeRunner

`src/services/scaffold/runner.ts`. After the other stages have queued their ops, the runner decides which files to execute (tests, scripts, examples, specs, codemods) and returns them as `bash` ops. It never runs anything itself; `apply` does. Pipeline context: [scaffold.md](./scaffold.md).

`CodeRunner.run(ops, { cwd, scopedRunOptions?, disabled?, pathResolution? }): BashOp[]`

## What runs

1. **Kind.** `kindOf(path)` (`src/services/scaffold/matcher.ts`) checks `PATTERN_KINDS` regexes first, then `classify()` from `@paladin/utils` (`fs/rules.json`). A file is runnable when a default registration's `matches` claims it (`isRunnable`), by kind or, for a matcher with no `kind`, by `basename` alone.
   Pattern kinds: `example` (`*.examples.*`), `recast-spec` (`packages/recast/src/specs/`), `codemod` (transforms/commands under `packages/codemod/`, and corpus `output.ts`). Anything runnable outside `rules.json`'s scheme needs a `PATTERN_KINDS` entry or a `basename` matcher.
2. **Targets.** Every `write` **or `skip`** of a runnable is a target, so unchanged files rerun. A written non-runnable also targets the runnables that import it (`imports` map, updated from each runnable's content whenever it is written or skipped; local imports only, resolved on disk via `resolveRelativePath`). A skipped source drags in nothing.
3. **Package tests.** A written/skipped `package.json` with a `scripts.test` emits `bun run test` with cwd at that package and suppresses per-file `test` runs beneath it.
4. **Registrations.** Targets are grouped by their matching registration. The **first registered** match wins, so list specific registrations before general ones, where every field set on `matches` (`kind` against `kindOf(path)`, `ext`, `basename`) must hold (`matches()` in `matcher.ts`). Ids in `disabled` and registrations with `enabled: false` are skipped. `grouped` → one command over all matched paths; otherwise one command per path.

## Registration

```ts
{
  id?: string          // re-registering an id replaces it; keys scopedRunOptions
  matches: { kind?: string; ext?: string; basename?: string }
  command: string      // space-split; usually just the executable
  purpose?: BashOp["purpose"]   // defaults to the kind; decides ordering (BASH_ORDER)
  strict?: boolean     // failure blocks later commands (default false)
  grouped?: boolean
  acceptsOptions?: boolean      // default: whether command contains <opts>
  options?: Record<string, unknown>
  enabled?: boolean    // default true
}
```

Command building (`toArgs`):
- paths are appended unless `<path>`/`<paths>` places them;
- `@owner/pkg/file` tokens resolve to that package's location through `resolveScopedPath` (so `bun run @paladin/recast/runner.ts` works from any project);
- options JSON (`options` overlaid by `scopedRunOptions[id]`) is appended as `--opts <json>` (after the paths, so it stays last), only when the registration accepts options and the merge isn't empty. `<opts>` places it explicitly.

## Default registrations (`DEFAULT_REGISTRATIONS`)

| id | kind | command | notes |
|---|---|---|---|
| `test-ts` | test, `ts` | `bun test` | grouped |
| `test-tsx` | test, `tsx` | `bun test --preload ./happydom.ts` | grouped |
| `script` | script | `bun run` | |
| `demo` | demo | `bun run` | |
| `story` | story, `tsx` | `bun run @paladin/storylite` | `enabled: false` (TODO) |
| `example` | example | `bun run @paladin/exemplar/cli.ts` | grouped, accepts options, purpose `example` |
| `tsx-example` | example, `tsx` | `bun run @paladin/webrun/cli.ts` | purpose `example`; registered before `example` so it wins for `*.examples.tsx` |
| `recast-spec` | recast-spec | `bun run @paladin/recast/runner.ts` | purpose `script`; see [runners/recast-spec.md](./runners/recast-spec.md) |
| `webrun` | basename `App.tsx` | `bun run @paladin/webrun/cli.ts` | purpose `demo` |
| `codemod` | codemod | `bun run @paladin/codemod/test.ts` | purpose `test`; see `packages/codemod/README.md` |

`ScaffoldService` takes `codeRunner: { registrations?, disabled?, scopedRunOptions? }`; `registrations` replaces the defaults wholesale.

## Adding a runnable kind

1. Add a `Registration` to `DEFAULT_REGISTRATIONS`. To match by file name instead of kind, give `matches` a `basename` and no `kind`.
2. If `classify()` doesn't know the kind, add a `PATTERN_KINDS` regex in `matcher.ts`.
3. Nothing else: `isRunnable` is shared, so `updateBarrel` already keeps such files out of the barrel.
4. If it needs a new `purpose`, add it to `BashOp["purpose"]` in `types.ts` and to `BASH_ORDER` in `ops.ts`.

## What happens to the commands

`apply` merges the runner's ops with the rest: duplicates (same cwd + args) collapse, and they run after writes, ordered by purpose. Non-zero exits are recorded on the op (`reason: "exit N"`, stdout/stderr/`data` in `result`) and don't stop anything unless the registration is `strict`. `print.ts` reads example runs off `result.data` (`files[].items[].error`, `displayError`, `artifactPath`, `artifactPaths`) to surface errors and artifacts. Only `<BASH>` payloads (`markBashPayload`) become `result.data`; plain stdout is never scanned for paths.

## Tests

`matcher.test.ts` covers `kindOf` and `matches`. `runner.test.ts` — pure: hand it `write`/`skip` ops, assert on the returned `BashOp.args`. Files that get imported must really exist on disk (import resolution reads it).
