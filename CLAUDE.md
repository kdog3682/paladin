# Paladin

- Anything involving a browser or page (serving an app, what's running, checking what a page does, driving it, screenshots): run `webrun --status` first. It prints the server state plus the full usage. If the command is missing, `ln -s $PWD/packages/webrun/src/cli.ts ~/.local/bin/webrun`.
- Codemods (running/testing transforms, corpus fixtures): see `packages/codemod/README.md`.
- `packages/api2` (scaffold, CodeRunner, post-processors) is heavily edited. Before changing it, read `packages/api2/docs/scaffold.md` (pipeline) and, for the runner, `packages/api2/docs/runner.md`.
