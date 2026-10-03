/*
ci counterpart to runExampleFiles.
  runTest("/repo/a/packages/b")
replays every examples file that has a snapshot and reports the ones whose
output no longer matches. read only — never writes a baseline, never calls
display. the snapshot dir is the manifest of what to check, so a file that has
never been through runExampleFiles is not tested here.
*/
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { deriveNamespace, runArgv } from "@paladin/utils"
import {
  type ExampleFile,
  type Spec,
  type Status,
  resolveHooks,
  runFile,
  snapshotDir,
  summarize,
  unflatten,
} from "./base"

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
  /* the stored baseline */
  expected: string
  /* what this run produced, or the error it threw */
  received: string
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

/* snapshot filenames are flattened relpaths, so they round-trip back to paths */
async function snapshotRelpaths(root: string) {
  const names = await readdir(snapshotDir(root)).catch(() => [] as string[])
  return names
    .filter((name) => name.endsWith(".cache.json"))
    .map(unflatten)
    .sort()
}

/* pkgdir is the package root, or any path inside it */
export async function runTest(pkgdir: string, options: Options = {}): Promise<TestSummary> {
  const { namespace, root, getRelpath } = deriveNamespace(pkgdir)
  const { serialize } = await resolveHooks(namespace, root, { serialize: options.serialize })

  const context = {
    namespace,
    root,
    getRelpath,
    serialize,
    display: null,
    update: false,
    write: false,
  }

  const files: ExampleFile[] = []
  const passes: Pass[] = []
  const failures: TestFailure[] = []

  for (const relpath of await snapshotRelpaths(root)) {
    const file = await runFile(join(root, relpath), context)
    files.push(file)

    /* only `match` counts as a pass — `new` has no baseline to hold it to */
    const statements = file.items
      .filter((item) => item.status === "match")
      .map((item) => item.desc || item.name)
    if (statements.length) passes.push({ file: file.relpath, statements })

    for (const item of file.items) {
      if (item.status !== "changed" && item.status !== "error") continue
      failures.push({
        relpath: file.relpath,
        name: item.name,
        statement: item.desc,
        status: item.status,
        expected: item.previousOutput ?? "",
        received: item.error ?? item.output,
      })
    }
  }

  return { namespace, root, passes, summary: summarize(files), failures, ok: !failures.length }
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
