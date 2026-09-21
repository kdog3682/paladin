# webrun

Serves one file with vite and puts it in the browser. `webrun path/to/App.tsx` for an app,
`webrun path/to/Button.examples.tsx` for a gallery of examples. Calling it again with another
file swaps what's on screen, in the tab that's already open.

```
webrun <path/to/App.tsx | path/to/name.examples.tsx> [--open] [--no-open] [--virtual] [--passthrough] [--no-user-config]
webrun --status | --stop
```

`web-probe` (see `src/probe`, `web-probe --help`) drives the served page in headless Chrome.

## What a call does

`webrun()` in `src/webrun.ts` picks one of three paths, in this order:

1. **Reuse.** The same app is already being served. Nothing changes; it prints a report (url, pid,
   uptime, new errors from `vite.log` since the last report). `--open` opens a tab instead.
2. **Swap in place.** A server is up and the new file would run on the very config it has loaded.
   The server stays; the entry is rewritten and the open tab reloads onto it (~100ms).
3. **Restart.** Anything else. The old server is killed, a new one started on the same port.

State lives in `~/.cache/paladin/webrun/state.json` (`src/state.ts`): app, pid, port, url, workdir,
mode, log path, run count. It is written the moment vite is spawned, not when it is ready, so a call
that dies mid-start still leaves a server the next call can find and stop. A bad path is rejected
before anything is torn down.

The port is fixed (`35737`), so the url survives every restart.

## Modes

`plan()` in `src/detect.ts` decides how vite is rooted.

- **virtual** — a generated `index.html` + `main.tsx` in a scratch dir mounts the file. The default
  for anything a project's own entry doesn't mount.
- **passthrough** — the project's own `index.html` runs untouched. Chosen only when that html's
  entry imports *this* file directly (one level: `main.tsx` importing `App.tsx`, not `App.tsx`
  importing a button). Deeper matching would make every file in the repo "match" and silently show
  the wrong thing.

`--virtual` / `--passthrough` force one. An `.examples.tsx` file is always virtual.

Either way the project's vite config is merged in underneath ours (`templates/vite.config.tmpl`),
minus its `test` and `build` blocks and the plugins in `BLOCKED_PLUGINS` (vitest, checker, storybook,
…) — the ones that would start a run when the server comes up. Ours win on `root`, `cacheDir`, host
and `fs.allow`. React and tailwind plugins are added only when the project doesn't already have them.
`--no-user-config` skips their config entirely.

## Scratch dir

`<project>/node_modules/.webrun/<hash of project>/` holds the generated `vite.config.ts`, the shell
(`index.html`, `main.tsx`, `styles.css`), vite's cache and `vite.log`. It is keyed by **project**
(nearest `package.json`), not by app, so every app in a project shares one config. That is what
makes swap-in-place possible: the config text is a pure function of the layout, and two apps in one
project render identical text. `fs.allow` therefore leaves out the app's own directory (always inside
the project anyway).

The config is only rewritten when its text changes. Vite watches its config file and restarts itself
on any write, identical or not.

Because the scratch dir is under `node_modules`, vite's dependency scan skips it. The config lists
`react`, `react-dom`, `react-dom/client` and `react/jsx-dev-runtime` in `optimizeDeps.include`;
without that `react-dom/client` is served as raw commonjs and the page is blank.

## Examples files

A file named `<name>.examples.tsx` (`isExamples` in `src/paths.ts`) is a set of top-level exports:

```tsx
export function primary() { return <Button>Save</Button> }
export function disabled() { return <Button disabled>Save</Button> }
```

`templates/examples.tsx.tmpl` renders each exported function as a card.

- Order is source order. A module namespace enumerates alphabetically, so the file is also imported
  with `?raw` and the `export function` names are read off it; other function exports
  (`export const x = () => …`) follow.
- Each function is called *inside* a component, so hooks work.
- A return value that isn't renderable is shown as JSON. A throw is caught per card by an error
  boundary; the others still render.
- `default` and non-function exports are skipped.
- `#name` in the url shows just that example; each title links to it.

It doesn't matter what was running before, or which package the examples live in. The file is served
like any other target, through whichever of the three paths above applies.

## Swapping the open tab

**Same project → in place.** All of these must hold (`webrun()`): same port, same scratch dir, both
the old and new run virtual, the server is alive and answering, and the new layout renders the
config text already on disk (`configMatches`). Then webrun rewrites the shell for the new file
(`scaffold`) and requests `/__webrun/reload` on the server. That endpoint, from the `control()`
plugin in the config template:

- calls `server.moduleGraph.invalidateAll()` — the rewritten `main.tsx` is under `node_modules`,
  which vite doesn't watch, so its cached transform would otherwise be served stale;
- sends a `full-reload` over the HMR socket.

Every connected tab reloads at once, with no process restart. This covers app ↔ app, app ↔
examples and examples ↔ examples within a project.

**Another project, or passthrough → restart.** The config, plugins or root differ, so the server is
killed and a new one started on the same port. The tab isn't told anything; it relies on vite's own
client noticing the socket drop and reloading once the port answers. That takes a second or two and
is the less reliable path: vite skips the reload if the socket closed cleanly and pauses while the
tab is hidden. If a tab doesn't follow, refresh it.

**Opening a browser.** A fresh start opens one, unless a tab is still attached to the server being
replaced. `/__webrun/clients` (same plugin) reports the number of tabs on the HMR socket, and
`webrun()` asks it before swapping. `--open` / `--no-open` override.

## Testing

`bun test` in this package. `webrun.test.ts` runs real vite servers on port `35738` with
`XDG_CACHE_HOME` pointed at a throwaway dir (it must be set before the module loads, hence the
dynamic import), so it never touches your real state or server. The tests are ordered and share a
server on purpose: reuse, swap in place, then restart is the sequence being tested. The examples
gallery fixture is `src/test/fixtures/gallery`.

Checking a swap by hand: hold a page open and change the app from another terminal.

```
webrun src/test/fixtures/hello/App.tsx --no-open
web-probe --text body --reload 10000 --text body &   # waits for the page to reload itself
webrun src/test/fixtures/gallery/Card.examples.tsx
wait
```
