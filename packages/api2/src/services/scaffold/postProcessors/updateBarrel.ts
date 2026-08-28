import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { runnableKind } from "../runner"
import type { File, PostProcessResult, Unit } from "../types"

const BARREL = "src/index.ts"

function exportable(unit: Unit, barrel: string, file: File): boolean {
  if (file.status !== "created") return false
  if (file.path === barrel) return false
  if (runnableKind(file.path)) return false
  if (!/\.tsx?$/.test(file.path)) return false

  const rel = relative(unit.dir, file.path)
  if (!rel.startsWith("src/")) return false
  if (rel.startsWith("src/test/")) return false
  return true
}

function toExport(barrel: string, file: File): string {
  const rel = relative(dirname(barrel), file.path).replace(/\.tsx?$/, "")
  return `export * from "./${rel}"`
}

export async function updateBarrel(unit: Unit): Promise<PostProcessResult> {
  const barrel = join(unit.dir, BARREL)
  const lines = unit.files
    .filter((file) => exportable(unit, barrel, file))
    .map((file) => toExport(barrel, file))

  if (!lines.length) return { name: "updateBarrel", paths: [] }

  const existing = existsSync(barrel) ? readFileSync(barrel, "utf8") : ""
  const separator = existing && !existing.endsWith("\n") ? "\n" : ""

  mkdirSync(dirname(barrel), { recursive: true })
  writeFileSync(barrel, existing + separator + lines.join("\n") + "\n")

  return { name: "updateBarrel", paths: [barrel] }
}
