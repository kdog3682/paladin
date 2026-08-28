import { existsSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { append, isWrite } from "../ops"
import { runnableKind } from "../runner"
import type { FsOp, Unit, WriteOp } from "../types"

const BARREL = "src/index.ts"
const SOURCE = "updateBarrel"

/**
 * Only brand new source files get exported. Nothing has been written yet at this
 * point in the pipeline, so a path that already exists on disk is a file the
 * barrel has had its chance to pick up.
 */
function exportable(unit: Unit, barrel: string, op: FsOp): op is WriteOp {
  if (!isWrite(op) || op.mode !== "write") return false
  if (op.path === barrel || existsSync(op.path)) return false
  if (runnableKind(op.path)) return false
  if (!/\.tsx?$/.test(op.path)) return false

  const rel = relative(unit.dir, op.path)
  if (!rel.startsWith("src/")) return false
  if (rel.startsWith("src/test/")) return false
  return true
}

function toExport(barrel: string, path: string): string {
  const rel = relative(dirname(barrel), path).replace(/\.tsx?$/, "")
  return `export * from "./${rel}"`
}

export function updateBarrel(unit: Unit): FsOp[] {
  const barrel = join(unit.dir, BARREL)
  const existing = existsSync(barrel) ? readFileSync(barrel, "utf8") : ""

  // the unit may be authoring the barrel itself in this same pass
  const authored = unit.ops.find((op) => isWrite(op) && op.path === barrel) as WriteOp | undefined
  const current = existing + "\n" + (authored?.content ?? "")

  const lines = unit.ops
    .filter((op): op is WriteOp => exportable(unit, barrel, op))
    .map((op) => toExport(barrel, op.path))
    .filter((line) => !current.includes(line))

  if (!lines.length) return []

  return [append(SOURCE, barrel, lines.join("\n") + "\n")]
}
