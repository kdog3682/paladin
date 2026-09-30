# webrun

Serves one file with vite and opens it. `webrun path/to/App.tsx` for an app,
`webrun path/to/Button.examples.tsx` for a gallery of examples. Call it again with another file and
the tab that's already open switches to it.

```
webrun <path/to/App.tsx | path/to/name.examples.tsx> [--open] [--no-open] [--report] [--virtual] [--passthrough] [--no-user-config]
webrun --status | --stop
webrun [target] --build [--out <dir>] [--name <name>] [--no-open]         # freeze
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

## Building

`--build` freezes the app into one self-contained html — js, css and assets inlined, no server — in
`~/.paladin/apps/`, and opens it. The filename is the app's path under `~/projects` with the slashes
turned into `__` — `paladin__packages__web2__src__App.html` for
`~/projects/paladin/packages/web2/src/App.tsx` — since that directory is flat and a bare `App.html`
says nothing about where it came from. `--name` overrides it. With no target it builds the app currently being
served, so the flow is `webrun App.tsx`, poke at it, `webrun --build`. The server is neither needed
nor touched.

It builds what it serves: the same mode, the same generated shell (so an `.examples.tsx` target
builds its gallery), the project's vite config with react and tailwind filled in the same way. In
virtual mode the generated entry is written next to the app for the build and removed afterwards, so
its relative imports resolve as they do at dev time. `--out` picks another directory, `--name` another
filename, `--no-open` skips the browser.

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
