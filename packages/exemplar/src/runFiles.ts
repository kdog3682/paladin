/*
runs `.examples.` files and records their output.
  runExampleFiles(["/repo/a/packages/b/src/foo.examples.ts"])
every example always runs; new outputs are saved as the baseline automatically.
pass `update` to also accept changed outputs as the new baseline.
*/
import { deriveNamespace } from "@paladin/utils"
import { type ExampleFile, type ExampleReport, type Spec, resolveHooks, runFile } from "./base"

export type Options = {
  /* overrides the namespace's `serialize` hook */
  serialize?: Spec
  /* overrides the namespace's `display` hook */
  display?: Spec
  /* accept changed outputs as the new baseline */
  update?: boolean
}

/* paths are absolute, and all expected to live in the same package */
export async function runExampleFiles(paths: string[], options: Options = {}): Promise<ExampleReport> {
  const { update = false } = options
  const { namespace, root, getRelpath } = deriveNamespace(paths[0])
  const { serialize, display } = await resolveHooks(namespace, root, options)

  const files: ExampleFile[] = []
  for (const path of paths) {
    files.push(await runFile(path, { getRelpath, serialize, display, update }))
  }

  return { namespace, root, files }
}
