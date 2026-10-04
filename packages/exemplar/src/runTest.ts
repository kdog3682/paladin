/*
ci counterpart to runExampleFiles.
  runTest("/repo/a/packages/b")
replays every examples file in the package that has a baseline, through
runExampleFiles, and reports the ones whose output no longer matches as a
unified diff of baseline -> current. changed baselines are left alone (no
`update`), but it is a normal run otherwise: new baselines are written and
pictures rendered. a file that has never been through runExampleFiles has no
baseline, so it is not tested here.
*/
import { createTwoFilesPatch } from "diff"
import { sep } from "node:path"
import { deriveNamespace, runArgv } from "@paladin/utils"
import type { Spec, Status } from "./base"
import { runExampleFiles } from "./runFiles"
import { snapshotSources } from "./snapshots"

export type Options = {
  /* overrides the namespace's `serialize` hook — must match how the baseline was written */
  serialize?: Spec
}

export type TestFailure = {
  relpath: string
  name: string
  /* the docstring of the example, read as the statement it failed to hold up */
  statement: string
  status: "changed" | "error"
  /* unified diff of the stored baseline against this run's output; set for `changed` */
  diff?: string
  /* what the example threw; set for `error` */
  error?: string
}

export type Pass = {
  /* relpath of the examples file */
  file: string
  /* docstring of each example that matched its baseline */
  statements: string[]
}

export type TestSummary = {
  namespace: string
  root: string
  passes: Pass[]
  summary: Record<Status, number>
  failures: TestFailure[]
  ok: boolean
}

function diffOf(label: string, previous: string, output: string) {
  return createTwoFilesPatch(`${label} (baseline)`, `${label} (current)`, `${previous}\n`, `${output}\n`, "", "", {
    context: 3,
  })
}

/* pkgdir is the package root, or any path inside it */
export async function runTest(pkgdir: string, options: Options = {}): Promise<TestSummary> {
  const { namespace, root } = deriveNamespace(pkgdir)
  const paths = snapshotSources().filter((path) => path.startsWith(root + sep))
  const summary: Record<Status, number> = { new: 0, match: 0, changed: 0, error: 0 }
  if (!paths.length) return { namespace, root, passes: [], summary, failures: [], ok: true }

  const report = await runExampleFiles(paths, { serialize: options.serialize })
  const passes: Pass[] = []
  const failures: TestFailure[] = []

  for (const file of report.files) {
    /* only `match` counts as a pass — `new` has no baseline to hold it to */
    const statements = file.items
      .filter((item) => item.status === "match")
      .map((item) => item.desc || item.name)
    if (statements.length) passes.push({ file: file.relpath, statements })

    for (const item of file.items) {
      summary[item.status]++
      const base = { relpath: file.relpath, name: item.name, statement: item.desc }
      if (item.status === "error") failures.push({ ...base, status: "error", error: item.error })
      if (item.status === "changed") {
        const label = `${file.relpath}#${item.name}`
        failures.push({ ...base, status: "changed", diff: diffOf(label, item.previous ?? "", item.output) })
      }
    }
  }

  return { namespace, root, passes, summary, failures, ok: !failures.length }
}

if (import.meta.main) {
  const spec = {
    bin: "exemplar-test",
    intro: "replay every examples file in a package that has a baseline and report the ones that no longer match",
    args: [{ name: "pkgdir", help: "the package directory" }],
    kwargs: { serialize: { arg: "spec", help: "override the namespace's serialize hook" } },
  } as const
  runArgv(spec, process.argv.slice(2), ({ args, kwargs }) =>
    runTest(args.pkgdir, { serialize: kwargs.serialize }),
  ).then((code) => {
    process.exitCode = code
  })
}
