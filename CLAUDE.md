# Paladin

- Anything involving a browser or page (serving an app, what's running, checking what a page does, driving it, screenshots): run `webrun --status` first. It prints the server state plus the full usage. If the command is missing, `ln -s $PWD/packages/webrun/src/cli.ts ~/.local/bin/webrun`.

- Codemods (running/testing transforms, corpus fixtures): see `packages/codemod/README.md`.

- `packages/api2` (scaffold, CodeRunner, post-processors) is heavily edited. Before changing it, read `packages/api2/docs/scaffold.md` (pipeline). Hot paths, all under `packages/api2/`:
  - `src/services/scaffold/runner.ts`: CodeRunner and `DEFAULT_REGISTRATIONS` (which files run, with what command; first match wins). Tests: `runner.test.ts`.
  - `src/services/scaffold/matcher.ts`: `kindOf` and `PATTERN_KINDS` (path patterns outside `fs/rules.json` in `@paladin/utils`). Tests: `matcher.test.ts`.
  - `src/services/scaffold/apply.ts` and `ops.ts`: how the runner's `bash` ops are merged, ordered (`BASH_ORDER`) and executed.
  - `src/services/scaffold/print.ts`: reads example runs off `result.data` (only `<BASH>` payloads; plain stdout is never scanned for paths).
  - `docs/runners/recast-spec.md`: the recast-spec runner.
