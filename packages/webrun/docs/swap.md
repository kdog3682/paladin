# Swapping the open tab

`webrun <other file>` while a tab is open changes what that tab shows, without a new tab and
without a manual refresh. How, and where it can stop working.

Code: `webrun()` in `src/webrun.ts`, `plan()` in `src/detect.ts`, `scaffold.ts`,
`templates/vite.config.tmpl` (the `control()` plugin).

## Two paths

`webrun()` reads the state file, plans the layout for the new file, then takes the first that applies:

1. **Reuse** — same app as the running server. No swap; prints a report.
2. **In place** — the running server can serve the new file as it is. Server stays, tab reloads.
3. **Restart** — anything else. Kill, start again on the same port.

## In place

Every one of these must hold, all checked in `webrun()` before touching the server:

| condition | why |
| --- | --- |
| same port | it is the server the tab is talking to |
| `state.workdir === layout.workdir` | same project (scratch dir is keyed by project) |
| old and new mode are both `virtual` | passthrough is rooted at the project's own `index.html`, not our scratch dir |
| pid alive and url answers | otherwise there is nothing to swap into |
| `configMatches(layout)` | the generated config on disk is byte-identical to what this layout would render |

The last row is what makes it work. The generated config is a pure function of the
layout (root, project vite config, tailwind, `fs.allow`), and two apps in one project produce the
same text — the scratch dir is `node_modules/.webrun/<hash of project>`, and `fs.allow` leaves out
the app's own dir so it can't make the config differ per app. If any input changes (their vite
config is edited, `--no-user-config` is toggled, tailwind appears), the text differs and it falls
through to a restart.

When they hold:

1. `scaffold()` rewrites the shell in the scratch dir: `main.tsx` mounts the new file (or the
   examples gallery), plus `index.html`'s title and `styles.css`. The config is *not* rewritten —
   `writeConfig` skips identical text, because vite watches its config file and restarts itself on
   any write.
2. `GET /__webrun/reload`, served by the `control()` plugin in the config:
   - `server.moduleGraph.invalidateAll()` — the scratch dir is under `node_modules`, which vite
     doesn't watch, so it never learns `main.tsx` changed and would serve the old transform.
   - `server.ws.send({ type: "full-reload" })` — every connected tab reloads.
3. State is updated (`app`, `runs`); the pid is unchanged. If the reload request isn't ok it falls
   through to a restart.

A tab that is open on the server gets the new page ~100ms after webrun is called.

## Restart

Cross-project (different package, so different config, plugins, root, binary), or passthrough on
either side. The old server is killed (`SIGTERM`, then `SIGKILL` after 2s), the port is waited free,
a new vite is spawned on the same port.

The tab is **not told**. It depends on vite's own client: when the HMR socket drops it polls the
port and reloads when it answers. Two things make that unreliable, both in vite's client:

- if the socket closed *cleanly* (`wasClean`), it doesn't try at all;
- while the tab is hidden it stops polling until the tab is shown again.

Expect a second or two, and sometimes a refresh. A page-side poller was tried and dropped: it
reloaded, but added up to a second of polling latency on top of the restart and injected a script
into every page, passthrough included.

## Opening a browser

A fresh start opens a tab unless one is already attached to the server being replaced.
`GET /__webrun/clients` (same plugin) returns the number of clients on the HMR socket, or `-1` if
vite can't say; `webrun()` asks it before swapping and treats "unknown" as "none". `--open`
always opens, `--no-open` never does.

The count is HMR-socket connections, so a tab that has lost its socket isn't counted and a fresh
one opens. A tab loaded before this existed isn't counted either.

## Debugging a swap that didn't happen

Start with which path ran. In place prints `webrun · swapped to <file>`; a restart prints nothing.

- **Restarted when it should have swapped in place** — work down the conditions above. Most often
  the two files are in different packages (`state.workdir` differs), one side ran passthrough
  (`webrun --status` shows `mode`), or the config text changed. `--virtual` forces the shell.
- **Swapped, but the tab shows the old app** — the tab isn't connected. `curl
  http://127.0.0.1:35737/__webrun/clients` should be ≥ 1. A stale transform would show as the old
  app after a reload; check that `/main.tsx` (`curl` it) names the new file.
- **Restarted, tab didn't follow** — the vite-client limits above. Refresh. `web-probe --reload
  <ms>` can hold a page open to check it from a script.
- **Blank page** — `react-dom/client does not provide an export named 'createRoot'` means React
  wasn't pre-bundled; the config's `optimizeDeps.include` is what prevents it.

Watching it happen:

```
webrun src/test/fixtures/hello/App.tsx --no-open
web-probe --text body --reload 10000 --text body &
webrun src/test/fixtures/gallery/Card.examples.tsx
wait
```

`webrun.test.ts` covers it in order: the same-project swap keeps the pid and serves the new entry;
moving to another project replaces the process.
