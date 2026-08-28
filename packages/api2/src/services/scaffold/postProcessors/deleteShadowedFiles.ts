import { dirname } from "node:path"
import { isDir, isFile } from "@paladin/utils"
import { isSkip, isWrite, remove } from "../ops"
import type { FsOp, SkipOp, Unit, WriteOp } from "../types"

const EXTS = [".ts", ".tsx"]
const SOURCE = "deleteShadowedFiles"

function stripExt(path: string): string {
  return path.replace(/\.[^./]+$/, "")
}

/**
 * A unit that now owns `foo.ts` shouldn't also keep a `foo/` directory it no
 * longer writes into, nor a `foo.ts` sitting beside the `foo/` it does write
 * into. Emits deletes for both; apply decides whether they're safe to carry out.
 */
export function deleteShadowedFiles(unit: Unit): FsOp[] {
  const owned = new Set(
    unit.ops
      .filter((op): op is WriteOp | SkipOp => isWrite(op) || isSkip(op))
      .map((op) => op.path),
  )
  const ownsUnder = (dir: string) => [...owned].some((path) => path.startsWith(dir + "/"))

  const seen = new Set<string>()
  const ops: FsOp[] = []
  const push = (path: string) => {
    if (seen.has(path)) return
    seen.add(path)
    ops.push(remove(SOURCE, path))
  }

  for (const path of owned) {
    const dir = stripExt(path)
    if (dir.startsWith(unit.dir) && isDir(dir) && !ownsUnder(dir)) push(dir)

    const parent = dirname(path)
    if (!parent.startsWith(unit.dir) || parent === unit.dir) continue

    for (const ext of EXTS) {
      const shadow = parent + ext
      if (owned.has(shadow) || !isFile(shadow)) continue
      push(shadow)
    }
  }

  return ops
}
