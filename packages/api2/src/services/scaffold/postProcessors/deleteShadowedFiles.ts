import { existsSync, rmSync, statSync } from "node:fs"
import { dirname } from "node:path"
import type { PostProcessResult, Unit } from "../types"

const EXTS = [".ts", ".tsx"]

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory()
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile()
}

function stripExt(path: string): string {
  return path.replace(/\.[^./]+$/, "")
}

export async function deleteShadowedFiles(unit: Unit): Promise<PostProcessResult> {
  const owned = new Set(unit.files.map((file) => file.path))
  const ownsUnder = (dir: string) => [...owned].some((path) => path.startsWith(dir + "/"))
  const paths: string[] = []

  for (const file of unit.files) {
    const dir = stripExt(file.path)
    if (dir.startsWith(unit.dir) && isDir(dir) && !ownsUnder(dir)) {
      rmSync(dir, { recursive: true, force: true })
      paths.push(dir)
    }

    const parent = dirname(file.path)
    if (!parent.startsWith(unit.dir) || parent === unit.dir) continue
    for (const ext of EXTS) {
      const shadow = parent + ext
      if (owned.has(shadow)) continue
      if (isFile(shadow)) {
        rmSync(shadow, { force: true })
        paths.push(shadow)
      }
    }
  }

  return { name: "deleteShadowedFiles", paths }
}

