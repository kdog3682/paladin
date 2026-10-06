#!/usr/bin/env bun
import { helpText, runArgv, type Spec } from "@paladin/utils"
import type { WebrunOpts } from "./types"
import { webbuild } from "./build"
import { newErrors, recentActions } from "./proc"
import { ACTIONS } from "./probe/actions"
import { formatReport as formatProbe, probe } from "./probe/run"
import { formatScript, isScript, loadScript, runScript } from "./probe/script"
import { dirname, resolve } from "node:path"
import { formatReport, webresume, webrun, webstatus, webstop } from "./webrun"

const SRC = import.meta.dir
const HOME = dirname(SRC)

const INTRO = `Serves an App.tsx (or a name.examples.tsx, which shows one exported function at a time with an index of all of them; #<name> in the url picks one, default the first) with vite and opens it. Calling it again with another file switches the open tab to it. Use --status for anything about the running server (which app/url/pid, uptime, new vite errors) and don't go hunting through ps/ss/.webrun dirs.

Any action flag (or --preview) also drives the page in headless Chrome and reports what the browser saw. Actions run in the order given and exit 1 if one fails, skipping the rest. Serving for a probe never opens the browser unless --open is given.

If the server is already showing someone else's app (check --status), don't build a standalone page to test yours: serve it with --switch, probe it, then run --resume to put theirs back. Their open tab follows both swaps.

Use it to check what a page does in a real browser, instead of one-off puppeteer scripts or synthetic dispatchEvent calls, e.g.
  webrun path/to/App.tsx --keypress alt+f --expect '[role=dialog]' --preview
  webrun http://localhost:5173 --text body
  webrun path/to/Mine.tsx --switch --expect .thing --screenshot shot.png; webrun --resume

A test harness is a yaml script: \`webrun path/to/name.webrun.yaml\` serves its app, then runs every scenario in a fresh browser and exits 1 if one fails. Format: docs/scripts.md.

webrun's own source is ${HOME} (--info lists the files that matter).
`

const spec = {
  bin: "webrun",
  intro: INTRO,
  args: [{ name: "target", optional: true, help: "path/to/App.tsx, path/to/name.examples.tsx, path/to/name.webrun.yaml (a test script), or an http(s)/file:// url to probe as is (no target: probe the running server)" }],
  kwargs: {
    open: { help: "open the browser even on a reused server" },
    "no-open": { help: "never open the browser" },
    report: { help: "print the server report when an already-running server is reused" },
    virtual: { help: "force the generated shell" },
    passthrough: { help: "force the project's own index.html" },
    "no-user-config": { help: "ignore the project's vite config entirely" },
    stop: { help: "stop the running server" },
    switch: { help: "serve the target temporarily, remembering the app it replaces for --resume" },
    resume: { help: "serve the app the last --switch replaced again" },
    info: { help: "where webrun's source, templates, probe and docs live, plus the running server" },
    status: { help: "print the running server (app, url, mode, pid, uptime, new vite errors)" },
    build: { help: "build to one self-contained html in ~/.paladin/apps and open it, instead of serving (no target: the app currently being served)" },
    out: { arg: "dir", help: "where --build writes the html (default ~/.paladin/apps)" },
    name: { arg: "name", help: "output name for --build (default the path under ~/projects with / as __, e.g. paladin__packages__web2__src__App)" },
    ...ACTIONS,
    preview: { help: "also print a compact outline of the page (buttons, inputs, headings, text) after the actions" },
  },
} as const satisfies Spec

const isUrl = (s: string) => /^(https?|file):\/\//.test(s)

export function main(argv = process.argv.slice(2)) {
  return runArgv(spec, argv, async ({ args, kwargs, seq }) => {
    if (kwargs.stop) return void (await webstop())
    if (kwargs.resume) return (await webresume()) ? 0 : 1

    if (kwargs.info) {
      const rows: [string, string][] = [
        ["source", HOME],
        ["cli", resolve(SRC, "cli.ts")],
        ["gallery", resolve(SRC, "templates/examples.tsx.tmpl")],
        ["shell", resolve(SRC, "scaffold.ts")],
        ["probe", resolve(SRC, "probe/run.ts")],
        ["actions", resolve(SRC, "probe/actions.ts")],
        ["scripts", resolve(SRC, "probe/script.ts")],
        ["docs", resolve(HOME, "docs")],
        ["script format", resolve(HOME, "docs/scripts.md")],
      ]
      const width = Math.max(...rows.map(([k]) => k.length))
      console.log(["webrun · info", ...rows.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`)].join("\n"))
      const state = await webstatus()
      console.log(state ? "\n" + formatReport(state) : "\nwebrun · nothing running")
      return
    }

    if (kwargs.status) {
      const state = await webstatus()
      const { errors } = state ? await newErrors(state.log, state.logOffset) : { errors: [] }
      console.log(state ? formatReport(state, errors, await recentActions(state.log)) : "webrun · nothing running")
      return
    }

    const { target } = args

    if (kwargs.build) {
      if (target && isUrl(target)) throw new Error("--build needs a file to build, not a url")
      await webbuild(target, {
        outDir: kwargs.out,
        name: kwargs.name,
        open: kwargs["no-open"] ? false : undefined,
      })
      return
    }

    if (target && isScript(target)) {
      const script = await loadScript(resolve(target))
      let url = (await webstatus())?.url
      if (script.app) {
        const opts: WebrunOpts = { open: false }
        if (kwargs.switch) opts.switch = true
        url = (await webrun(script.app, opts)) ?? undefined
      }
      if (!url) throw new Error("no webrun server is running — set `app:` in the script or start one with `webrun <App.tsx>`")
      const results = await runScript(script, url)
      console.log(formatScript(script, results))
      return results.every((r) => r.ok) ? 0 : 1
    }

    const probing = seq.length > 0 || kwargs.preview
    if (!target && !probing) return void console.log(helpText(spec))

    let url: string | null | undefined = target && isUrl(target) ? target : undefined
    if (target && !url) {
      const opts: WebrunOpts = {}
      if (kwargs.open) opts.open = true
      else if (kwargs["no-open"] || probing) opts.open = false
      if (kwargs.report) opts.report = true
      if (kwargs.virtual) opts.mode = "virtual"
      if (kwargs.passthrough) opts.mode = "passthrough"
      if (kwargs["no-user-config"]) opts.userConfig = false
      if (kwargs.switch) opts.switch = true

      url = await webrun(target, opts)
      if (!url) return 1

      if (!probing) {
        // a fresh transform error (a bad import, say) only lands in the log once
        // something actually requests the module — load the page for real before
        // reporting, so agents see it here instead of having to run --status
        await probe({ url }).catch(() => {})
        const state = await webstatus()
        if (state) {
          const { errors } = await newErrors(state.log, state.logOffset)
          console.log(formatReport(state, errors, await recentActions(state.log)))
        }
        return
      }
    }
    if (!probing) return

    url ??= (await webstatus())?.url
    if (!url) throw new Error("no webrun server is running — start one with `webrun <App.tsx>` first")

    const result = await probe({ url, actions: seq, preview: kwargs.preview })
    console.log(formatProbe(result))
    return result.ok ? 0 : 1
  })
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code
  })
}
