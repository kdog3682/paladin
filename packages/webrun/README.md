# webrun

Serves one file with vite and opens it. `webrun path/to/App.tsx` for an app,
`webrun path/to/Button.examples.tsx` for a gallery of examples. Call it again with another file and
the tab that's already open switches to it.

```
webrun <path/to/App.tsx | path/to/name.examples.tsx> [--open] [--no-open] [--report] [--virtual] [--passthrough] [--no-user-config]
webrun --status | --stop
webrun [target] --click <sel> --expect <sel> --text <sel> --preview ...   # probe
```

Any action flag (or `--preview`) also drives the page in headless Chrome and reports what it saw
(`webrun --help` lists them all). With a path the app is served first (without opening a tab unless
`--open`), with no target the running server is probed, with an `http(s)://` url that page is probed
as is. Actions run in the order given; exit 1 if one fails.

## Behaviour

- Same file again: the server is reused, silently. `--report` prints the url, pid, uptime and new
  errors from `vite.log`; `--open` opens a tab instead.
- Different file: it replaces what's served, on the same port (`35737`), so the url never changes.
- State is in `~/.cache/paladin/webrun/state.json`.

## Modes

- **virtual** — a generated `index.html` + `main.tsx` mounts the file. The default.
- **passthrough** — the project's own `index.html`, used only when its entry imports *this* file
  directly. `--virtual` / `--passthrough` force one.

The project's vite config is merged underneath ours, minus its `test`/`build` blocks and plugins that
start a run (vitest, storybook, …). Generated files live in
`<project>/node_modules/.webrun/<hash of project>/`, including `vite.log`.

## Examples files

`<name>.examples.tsx` renders each exported function as a card, in source order:

```tsx
export function primary() { return <Button>Save</Button> }
export function disabled() { return <Button disabled>Save</Button> }
```

Hooks work; a throwing example only breaks its own card; non-renderable returns show as JSON;
`#name` in the url shows one. It is always virtual, wherever the file lives.

## If the tab doesn't switch

Swapping within a project is instant (the server stays up and the tab is told to reload). Swapping
into another project, or from/to passthrough, restarts vite, and the tab has to notice on its own —
it can take a couple of seconds or need a refresh. `docs/swap.md` has the conditions and a
checklist for when it misbehaves.

## Tests

`bun test`. `webrun.test.ts` runs real servers on port `35738` against a throwaway
`XDG_CACHE_HOME`, so it never touches your real server or state.
