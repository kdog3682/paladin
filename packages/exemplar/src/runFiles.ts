/*
runs `.examples.` files and records their output.
  runExampleFiles(["/repo/a/packages/b/src/foo.examples.ts"])
every example always runs; the snapshot is the baseline we compare against,
not a skip list. pass `update` to accept changed output as the new baseline.
*/
import { deriveNamespace, withArgv } from "@paladin/utils"
import { type ExampleFile, type ExampleReport, type Spec, resolveHooks, runFile, summarize } from "./base"

export type Options = {
  /* overrides the namespace's `serialize` hook */
  serialize?: Spec
  /* overrides the namespace's `display` hook */
  display?: Spec
  /* accept changed output as the new snapshot baseline */
  update?: boolean
}

/* paths are absolute, and all expected to live in the same package */
export async function runExampleFiles(paths: string[], options: Options = {}): Promise<ExampleReport> {
  const { update = false } = options
  const { namespace, root, getRelpath } = deriveNamespace(paths[0])
  const { serialize, display } = await resolveHooks(namespace, root, options)

  const context = { namespace, root, getRelpath, serialize, display, update, write: true }
  const files: ExampleFile[] = []
  for (const path of paths) files.push(await runFile(path, context))

  return { namespace, root, files, summary: summarize(files) }
}

export default withArgv(runExampleFiles, { variadic: true })
