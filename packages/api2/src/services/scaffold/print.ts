import { clip } from "@paladin/utils"
import type { ApplyResult, ExampleResult } from "./types"

/* artifacts written by display(), plus any emitted by a bash op */
function artifactsOf(result: ApplyResult, examples?: ExampleResult): string[] {
  const paths: string[] = []
  if (examples) {
    for (const file of examples.files) {
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
  return paths
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

/* clip the artifacts if there are any, else the bash output, else nothing */
export function print(result: ApplyResult, examples?: ExampleResult): null {
  const artifacts = artifactsOf(result, examples)
  if (artifacts.length) {
    for (const path of artifacts) clip(path)
    return null
  }
  const text = bashOf(result)
  if (text) clip(text)
  return null
}
