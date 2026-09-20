#!/usr/bin/env bun
import { runArgv, type Spec } from "@paladin/utils"
import { readState } from "../state"
import { ACTIONS } from "./actions"
import { formatReport, probe } from "./run"

const INTRO = `Drives the running webrun app in headless Chrome and reports what the browser saw: every action, console errors and warnings, failed requests, fonts. Actions run in the order given, left to right, and the server URL is determined automatically. Exits 1 if an action fails, skipping the rest.`

const spec = {
  bin: "web-probe",
  intro: INTRO,
  kwargs: {
    ...ACTIONS,
    preview: { help: "also print a compact outline of the page (buttons, inputs, headings, text) after the actions" },
  },
} as const satisfies Spec

export function main(argv = process.argv.slice(2)) {
  return runArgv(spec, argv, async ({ seq, kwargs }) => {
    const state = await readState()
    if (!state) throw new Error("no webrun server is running — start one with `webrun` first")
    const result = await probe({ url: state.url, actions: seq, preview: kwargs.preview })
    console.log(formatReport(result))
    return result.ok ? 0 : 1
  })
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code
  })
}
