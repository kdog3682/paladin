import { openInBrowser } from "@paladin/utils"
import { existsSync } from "node:fs"
import { relative, resolve } from "node:path"
import { plan } from "./detect"
import { DEFAULT_PORT, alive, clientCount, isUp, newErrors, kill, spawnVite, tail, waitPortFree, waitReady } from "./proc"
import { clearState, readState, writeState } from "./state"
import { configMatches, scaffold } from "./scaffold"
import type { WebrunOpts, WebrunState } from "./types"

function short(path: string) {
  const rel = relative(process.cwd(), path)
  return rel && !rel.startsWith("..") ? rel : path
}

/**
 * the only call to openInBrowser — so a non-url can never reach xdg-open.
 *
 * a stray file path handed to the desktop layer comes back as a warning on
 * stderr and nothing else, which is a miserable thing to trace back to its
 * call site. named openUrl rather than `open` so it can't be confused with
 * `opts.open`, which is a flag, not a function.
 */
async function openUrl(url: string) {
  if (!/^https?:\/\//.test(url)) throw new Error(`refusing to open a non-url: ${url}`)
  await openInBrowser(url)
}

function uptime(since: number) {
  const secs = Math.max(0, Math.round((Date.now() - since) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/** what a reused server prints instead of stealing focus with another browser tab */
export function formatReport(state: WebrunState, errs: string[] = []) {
  const rows: [string, string][] = [
    ["app", state.app],
    ["url", state.url],
    ["mode", state.mode],
    ["pid", String(state.pid)],
    ["uptime", uptime(state.startedAt)],
    ["runs", String(state.runs)],
    // the workdir can be blown away under a live server, so the log is not
    // guaranteed to be there just because state points at it
    ["log", existsSync(state.log) ? short(state.log) : `${short(state.log)} (missing)`],
  ]
  const width = Math.max(...rows.map(([k]) => k.length))
  const lines = ["webrun · already running", ...rows.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`)]

  // the server can be up and still be erroring — those only land in the log
  if (errs.length) {
    lines.push("", `new errors in ${short(state.log)}`)
    for (const err of errs) lines.push(...err.split("\n").map((l) => `  ${l}`))
  }
  return lines.join("\n")
}

/**
 * serve an App.tsx with vite.
 *
 * when an index.html above the app already mounts *that app*, the project runs
 * through its own setup untouched; otherwise a generated shell mounts it.
 * either way their vite config is merged in, minus its test blocks and runner
 * plugins.
 *
 * the first run of a given server opens the browser. later calls against the
 * same live server reuse it and stay quiet — pass `open` to force either way,
 * or `report` to print the server's status and new errors. a different app in the same project is swapped in on the running
 * server and the open tab reloads onto it; one in another project replaces the
 * server (a first run), and a tab still open on the old one stops a second from
 * opening.
 *
 * tears down anything *this call* started if it fails. returns the url, or null
 * on failure (errors are the only thing logged).
 */
export async function webrun(appPath: string, opts: WebrunOpts = {}) {
  const { timeout = 15_000, settle = 300, port = DEFAULT_PORT } = opts
  const app = resolve(appPath)

  let started: { pid: number; log: string } | null = null

  try {
    // checked before any teardown: a bad path should not cost you the server
    // you already have running
    if (!existsSync(app)) throw new Error(`no such app: ${app}`)

    const state = await readState()

    // already serving this exact app — reuse it and say so
    if (state?.app === app && state.port === port && alive(state.pid) && (await isUp(state.url))) {
      // only what's been logged since the last report
      // the log offset only moves when the errors are shown, so a silent reuse
      // leaves them for the next report (or `--status`)
      const { errors, size } = opts.report ? await newErrors(state.log, state.logOffset) : { errors: [], size: state.logOffset }
      const reused: WebrunState = { ...state, runs: state.runs + 1, logOffset: size }
      await writeState(reused)
      if (opts.open) await openUrl(reused.url)
      else if (opts.report) console.log(formatReport(reused, errors))
      return reused.url
    }

    const layout = await plan(app, opts)

    // a live server on this port, and the new app would run on the very config it
    // has loaded (same project, both through the generated shell): keep it. the
    // entry is rewritten and the open tab told to reload — no restart, so it
    // lands in a blink
    if (
      state &&
      state.port === port &&
      state.workdir === layout.workdir &&
      state.mode === "virtual" &&
      layout.mode === "virtual" &&
      alive(state.pid) &&
      (await isUp(state.url)) &&
      (await configMatches(layout))
    ) {
      const tabs = await clientCount(state.url)
      await scaffold(layout, app)
      if ((await fetch(new URL("__webrun/reload", state.url))).ok) {
        await writeState({ ...state, app, runs: state.runs + 1 })
        if (opts.open === true || (opts.open !== false && !tabs)) await openUrl(state.url)
        else console.log(`webrun · swapped to ${short(app)}`)
        return state.url
      }
    }

    // different project, or a dead/stale server — take the old one down first.
    // a tab left open on it is not counted on to follow (vite's own reconnect is
    // unreliable), but is enough to not open a second one
    let tabOpen = false
    if (state && state.port === port && alive(state.pid)) tabOpen = ((await clientCount(state.url)) ?? 0) > 0

    if (state && alive(state.pid)) {
      await kill(state.pid, settle)
      // state.json is the only record of this server — never drop it while it may still be running
      if (alive(state.pid)) throw new Error(`could not stop the previous server (pid ${state.pid})`)
    }
    await clearState()

    await scaffold(layout, app)

    if (!(await waitPortFree(port, 2_000))) throw new Error(`port ${port} is in use by another process`)

    const url = `http://127.0.0.1:${port}/`
    started = await spawnVite(layout, port)

    // recorded the moment it exists, not once it's ready: if this process dies
    // mid-startup the next call still finds the server through state.json
    await writeState({
      app,
      pid: started.pid,
      port,
      url,
      workdir: layout.workdir,
      log: started.log,
      mode: layout.mode,
      startedAt: Date.now(),
      runs: 1,
      logOffset: 0,
    })

    if (!(await waitReady(url, started.pid, timeout))) {
      const why = await tail(started.log)
      throw new Error(why || `vite failed to start on port ${port}`)
    }

    if (opts.open === true || (opts.open !== false && !tabOpen)) await openUrl(url)
    return url
  } catch (err) {
    // only tear down what this call started. clearing state without killing
    // would orphan a live vite with no pid left on disk to stop it with
    if (started) {
      await kill(started.pid, 0)
      await clearState()
    }
    console.log(err instanceof Error ? err.message : err)
    return null
  }
}

/** stop whatever webrun currently has running */
export async function webstop(opts: WebrunOpts = {}) {
  const { settle = 0 } = opts
  const state = await readState()
  if (state && alive(state.pid)) await kill(state.pid, settle)
  await clearState()
}

/** the current server, if there is a live one */
export async function webstatus() {
  const state = await readState()
  if (!state || !alive(state.pid) || !(await isUp(state.url))) return null
  return state
}
