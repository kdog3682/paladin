#!/usr/bin/env bun
import { openInBrowser, runArgv, type Spec } from "@paladin/utils"
import { plan } from "./find"
import { DEFAULT_PORT, HOME, alive, freePort, isUp, serve, stopPid, waitPortFree } from "./server"
import { clearState, readState, writeState } from "./state"
import { readFile } from "node:fs/promises"
import { collect, format, ok } from "./test"

const INTRO = `Renders the stories in a .stories. file in the browser and runs their play functions. Give it a file, or a directory to find every .stories. file under it (default: the current one).

A stories file is a default-exported meta plus one named export per story:

  export default { component: Button, args: { label: "Button" } }
  export const Primary = { args: { variant: "primary" } }
  export const Clicked = {
    play: async ({ canvas, userEvent, expect }) => {
      await userEvent.click(canvas.getByRole("button"))
      expect(canvas.getByText("clicked")).toBeInTheDocument()
    },
  }

The page runs every story on load and lists its pass/fail, renders the selected one, and shows its steps and errors. Every call also runs all of them headless against the server and prints the result like webrun's report: failing stories with the step that broke, then console errors, console warnings, failed requests and new errors in the vite log. Exit 1 if anything failed. --test does only that, on a throwaway server.

The server stays up in the background on one port, so the url and the open tab survive. Calling it again with the same target reuses it; with another target it restarts onto it and the open tab reloads itself. Nothing to stop or resume: the stories are the harness, and to find out what's running just call it again.

storylite's own source is ${HOME}.
`

const spec = {
  bin: "storylite",
  intro: INTRO,
  args: [{ name: "target", optional: true, help: "path/to/Name.stories.tsx, or a directory to search (default: .)" }],
  kwargs: {
    test: { help: "run every story headless, print the results, exit 1 on a failure (a throwaway server, the running one is left alone)" },
    open: { help: "open the browser even on a reused server" },
    "no-open": { help: "never open the browser" },
  },
} as const satisfies Spec

export function main(argv = process.argv.slice(2)) {
  return runArgv(spec, argv, async ({ args, kwargs }) => {
    const p = plan(args.target ?? ".")

    if (kwargs.test) {
      const server = await serve(p, freePort())
      try {
        const outcome = await collect(server.url)
        console.log(format(outcome))
        return ok(outcome) ? 0 : 1
      } finally {
        server.stop()
      }
    }

    const state = await readState()
    const live = state && alive(state.pid) && (await isUp(state.url)) ? state : null

    let url: string
    let log: string
    let offset = 0
    let pid: number
    let startedAt = Date.now()
    if (live?.target === p.target) {
      url = live.url
      log = live.log
      offset = live.logOffset ?? 0
      pid = live.pid
      startedAt = live.startedAt
      console.log(`storylite · already running ${url}`)
      if (kwargs.open) await openInBrowser(url)
    } else {
      // another target: restart on the same port, so the open tab reconnects and reloads onto it
      if (state && alive(state.pid)) await stopPid(state.pid)
      await clearState()
      if (!(await waitPortFree(DEFAULT_PORT))) throw new Error(`port ${DEFAULT_PORT} is in use by another process`)

      const server = await serve(p, DEFAULT_PORT, { detach: true })
      url = server.url
      log = server.log
      pid = server.pid
      console.log(`storylite · ${live ? "switched to" : "serving"} ${p.target}\n  url  ${url}\n  log  ${log}`)
      if (kwargs.open || (!live && !kwargs["no-open"])) await openInBrowser(url)
    }

    // what the browser shows is what gets reported: every story run headless against the live server,
    // so a failure or a console error reaches whoever ran this, not just whoever is looking at the page
    const outcome = await collect(url)
    console.log("\n" + format(outcome))

    const text = await readFile(log, "utf8").catch(() => "")
    const logged = text.slice(offset).split("\n").filter((l) => /\berror\b/i.test(l))
    if (logged.length) console.log("\n## new errors in the vite log", ...logged.slice(-10).map((l) => "  " + l.trim()))
    await writeState({ target: p.target, url, port: DEFAULT_PORT, pid, log, startedAt, logOffset: text.length })

    return ok(outcome) && !logged.length ? 0 : 1
  })
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code
  })
}
