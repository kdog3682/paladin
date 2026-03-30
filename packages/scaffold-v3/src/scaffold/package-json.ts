// @paladin/scaffold-v3/scaffold/package-json.ts

import { existsSync } from "fs"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import type { ResolvedFile, ExportEdit } from "./types"

/**
 * scan resolved files for workspace imports with subpaths.
 * for each subpath import like `@acme/foobar/utils/helpers`,
 * produce an ExportEdit to add `"./utils/helpers"` to foobar's exports.
 */
export function collectExportEdits(
  files: ResolvedFile[],
  projectName: string,
  projectDir: string,
  defaultWorkspaceFolder: string,
): ExportEdit[] {
  const prefix = `@${projectName}/`
  const edits = new Map<string, ExportEdit>()

  for (const file of files) {
    for (const entry of file.imports) {
      if (entry.kind !== "workspace" || !entry.subpath) continue

      const key = `${entry.package}::${entry.subpath}`
      if (edits.has(key)) continue

      const shortName = entry.package.slice(prefix.length)
      const packageDir = join(projectDir, defaultWorkspaceFolder, shortName)

      edits.set(key, {
        packageName: entry.package,
        packageDir,
        subpath: `./${entry.subpath}`,
        target: `./src/${entry.subpath}/index.ts`,
      })
    }
  }

  return [...edits.values()]
}

/**
 * apply export edits to the relevant package.json files.
 * merges new subpath entries into the existing exports field.
 * returns the list of edits that were actually applied.
 */
export async function applyExportEdits(edits: ExportEdit[]): Promise<ExportEdit[]> {
  const byPackage = new Map<string, ExportEdit[]>()
  for (const edit of edits) {
    const list = byPackage.get(edit.packageDir) ?? []
    list.push(edit)
    byPackage.set(edit.packageDir, list)
  }

  const applied: ExportEdit[] = []

  for (const [packageDir, packageEdits] of byPackage) {
    const pkgJsonPath = join(packageDir, "package.json")
    if (!existsSync(pkgJsonPath)) continue

    const raw = await readFile(pkgJsonPath, "utf-8")
    const pkg = JSON.parse(raw)

    const exports: Record<string, string> = pkg.exports ?? {}
    let changed = false

    for (const edit of packageEdits) {
      if (exports[edit.subpath]) continue
      exports[edit.subpath] = edit.target
      changed = true
      applied.push(edit)
    }

    if (changed) {
      pkg.exports = exports
      await writeFile(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n")
    }
  }

  return applied
}
