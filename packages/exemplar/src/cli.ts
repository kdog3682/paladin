#!/usr/bin/env bun
import { CLOSE_MARKER, MARKER, type Spec, helpText, runArgv } from "@paladin/utils"
import { runExampleFiles } from "./runFiles"

const INTRO = `Runs \`.examples.\` files: calls every exported example, serializes the result, and diffs it against the stored snapshot. Every example always runs — the snapshot is the baseline compared against, not a skip list.

--snapshot writes baselines for anything new; without it a run is read-only and reports "new" items without recording them. --update additionally accepts changed output as the new baseline.

Source: packages/exemplar/src/cli.ts, index.ts next to it.`

const spec = {
  bin: "exemplar",
  intro: INTRO,
  args: [{ name: "paths", help: "`.examples.` files to run, all from the same package", rest: true }],
  kwargs: {
    snapshot: { help: "write baselines for new examples" },
    update: { help: "also accept changed output as the new baseline" },
    serialize: { arg: "spec", help: "override the namespace's serialize hook" },
    display: { arg: "spec", help: "override the namespace's display hook" },
  },
} as const satisfies Spec

export function main(argv = process.argv.slice(2)) {
  return runArgv(spec, argv, async ({ args, kwargs }) => {
    if (!args.paths.length) return void console.log(helpText(spec))

    const report = await runExampleFiles(args.paths, {
      snapshot: kwargs.snapshot,
      update: kwargs.update,
      serialize: kwargs.serialize,
      display: kwargs.display,
    })
    console.log(`${MARKER}${JSON.stringify(report)}${CLOSE_MARKER}`)
    return report.summary.error ? 1 : 0
  })
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code
  })
}
