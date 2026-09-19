import { clip } from "@paladin/utils"
import type { ApplyResult, ExampleResult } from "./types"

/* every example run in the result, carried on the bash op that ran it */
function examplesOf(result: ApplyResult): ExampleResult[] {
  const runs: ExampleResult[] = []
  for (const unit of result.units) {
    for (const op of unit.ops) {
      if (op.kind !== "bash") continue
      const data = op.result?.data
      if (data?.files) runs.push(data as ExampleResult)
    }
  }
  return runs
}

/* item errors and display() failures from a run of the examples */
function errorsOf(result: ApplyResult): string {
  const blocks: string[] = []
  for (const run of examplesOf(result)) {
    for (const file of run.files) {
      for (const item of file.items ?? []) {
        if (item.error) blocks.push(`${file.relpath}#${item.name}\n${item.error}`)
      }
      if (file.displayError) blocks.push(`${file.relpath} (display)\n${file.displayError}`)
    }
  }
  return blocks.join("\n\n").trim()
}

/* artifacts written by display(), plus any emitted by a bash op */
function artifactsOf(result: ApplyResult): string[] {
  const paths: string[] = []
  for (const run of examplesOf(result)) {
    for (const file of run.files) {
      if (file.artifactPath) paths.push(file.artifactPath)
    }
  }
  for (const unit of result.units) {
    for (const op of unit.ops) {
      if (op.kind !== "bash") continue
      const found = op.result?.data?.artifactPaths
      if (found?.length) paths.push(...found)
    }
  }
  return [...new Set(paths)]
}

/* raw output from every bash op */
function bashOf(result: ApplyResult): string {
  const blocks: string[] = []
  for (const unit of result.units) {
    for (const op of unit.ops) {
      if (op.kind !== "bash") continue
      const res = op.result
      if (!res) continue
      const out = [res.stdout, res.stderr]
        .map(text => text?.trim())
        .filter(Boolean)
        .join("\n")
      if (!out) continue
      blocks.push([`$ ${res.args.join(" ")}`, out].join("\n"))
    }
  }
  return blocks.join("\n\n").trim()
}

/* clip the error if the run failed, else the artifacts, else the bash output, else nothing */
export function print(result: ApplyResult): void {
  const errors = errorsOf(result)
  if (errors) {
    clip(errors)
    return
  }

  const artifacts = artifactsOf(result)
  if (artifacts.length) {
    for (const path of artifacts) clip(path)
    return
  }

  const text = bashOf(result)
  if (text) clip(text)
}
