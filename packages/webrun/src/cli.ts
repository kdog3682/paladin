#!/usr/bin/env bun
import { helpText, runArgv, type Spec } from "@paladin/utils"
import type { WebrunOpts } from "./types"
import { newErrors } from "./proc"
import { ACTIONS } from "./probe/actions"
import { formatReport as formatProbe, probe } from "./probe/run"
import { formatReport, webrun, webstatus, webstop } from "./webrun"

const INTRO = `Serves an App.tsx (or a name.examples.tsx, which renders every exported function in it as an example; #<name> in the url isolates one) with vite and opens it.

Any action flag (or --preview) also drives the page in headless Chrome and reports what the browser saw: every action, console errors and warnings, failed requests, fonts. Actions run in the order given, left to right, and exit 1 if one fails, skipping the rest. With a path the app is served first, without a target the running server is probed, and with an http(s) url that page is probed as is. Serving for a probe never opens the browser unless --open is given.`

const spec = {
  bin: "webrun",
  intro: INTRO,
  args: [{ name: "target", optional: true, help: "path/to/App.tsx, path/to/name.examples.tsx, or an http(s) url to probe" }],
  kwargs: {
    open: { help: "open the browser even on a reused server" },
    "no-open": { help: "never open the browser" },
    report: { help: "print the server report when an already-running server is reused" },
    virtual: { help: "force the generated shell" },
    passthrough: { help: "force the project's own index.html" },
    "no-user-config": { help: "ignore the project's vite config entirely" },
    stop: { help: "stop the running server" },
    status: { help: "print the running server" },
    ...ACTIONS,
    preview: { help: "also print a compact outline of the page (buttons, inputs, headings, text) after the actions" },
  },
} as const satisfies Spec

const isUrl = (s: string) => /^https?:\/\//.test(s)

export function main(argv = process.argv.slice(2)) {
  return runArgv(spec, argv, async ({ args, kwargs, seq }) => {
    if (kwargs.stop) return void (await webstop())

    if (kwargs.status) {
      const state = await webstatus()
      const { errors } = state ? await newErrors(state.log, state.logOffset) : { errors: [] }
      console.log(state ? formatReport(state, errors) : "webrun · nothing running")
      return
    }

    const { target } = args
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

      url = await webrun(target, opts)
      if (!url) return 1
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
