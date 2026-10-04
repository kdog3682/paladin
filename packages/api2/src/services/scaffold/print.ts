import type { ExampleReport } from "@paladin/exemplar"
import { clip } from "@paladin/utils"
import { gallery } from "./gallery"
import type { ApplyResult } from "./types"

/* every example run in the result, carried on the bash op that ran it */
function examplesOf(result: ApplyResult): ExampleReport[] {
  const runs: ExampleReport[] = []
  for (const unit of result.units) {
    for (const op of unit.ops) {
      if (op.kind !== "bash") continue
      const data = op.data
      if (data?.files) runs.push(data as ExampleReport)
    }
  }
  return runs
}

/* item errors and display() failures from a run of the examples */
function errorsOf(result: ApplyResult): string {
  const blocks: string[] = []
  for (const run of examplesOf(result)) {
    for (const file of run.files) {
      for (const item of file.items) {
        if (item.error) blocks.push(`${file.relpath}#${item.name}\n${item.error}`)
        if (item.displayError) blocks.push(`${file.relpath}#${item.name} (display)\n${item.displayError}`)
      }
    }
  }
  return blocks.join("\n\n").trim()
}

/* the example runs as one report, or null when none rendered a picture */
function galleryOf(result: ApplyResult): ExampleReport | null {
  const runs = examplesOf(result)
  const files = runs.flatMap(run => run.files)
  if (!files.some(file => file.items.some(item => item.artifactPath))) return null
  return { ...runs[0], files }
}

/* artifacts other runners report; example pictures go through the gallery */
function artifactsOf(result: ApplyResult): string[] {
  const paths: string[] = []
  for (const unit of result.units) {
    for (const op of unit.ops) {
      if (op.kind !== "bash") continue
      const found = op.data?.artifactPaths
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
      const out = [op.stdout, op.stderr]
        .map(text => text?.trim())
        .filter(Boolean)
        .join("\n")
      if (!out) continue
      blocks.push([`$ ${op.args.join(" ")}`, out].join("\n"))
    }
  }
  return blocks.join("\n\n").trim()
}

/* clip the error if the run failed, else the example gallery, else other artifacts, else the bash output, else nothing */
export function print(result: ApplyResult): void {
  const errors = errorsOf(result)
  if (errors) {
    clip(errors)
    return
  }

  const report = galleryOf(result)
  if (report) {
    clip(gallery(report))
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
