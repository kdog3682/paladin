// @paladin/scaffold-v2/scaffold/matchers/barrel-export.ts

import { existsSync } from "fs"
import { join, basename, dirname } from "path"
import type { Matcher, CreatedFile } from "./types"

/**
 * if a file matches the pattern <n>/<n>.tsx and no index.ts
 * exists on disk or among the current files, create a barrel index
 * that re-exports everything from the component file.
 *
 * e.g. src/Sidebar/Sidebar.tsx → creates src/Sidebar/index.ts
 *      with `export * from "./Sidebar"`
 */
export const barrelExportMatcher: Matcher = async (pkg) => {
  const filesCreated: CreatedFile[] = []

  for (const f of pkg.files) {
    if (!f.absolutePath.endsWith(".tsx")) continue

    const fileName = basename(f.absolutePath, ".tsx")
    const dirName = basename(dirname(f.absolutePath))

    if (fileName !== dirName) continue

    const indexPath = join(dirname(f.absolutePath), "index.ts")

    const existsOnDisk = existsSync(indexPath)
    const existsInFiles = pkg.files.some(other => other.absolutePath === indexPath)

    if (existsOnDisk || existsInFiles) continue

    filesCreated.push({
      absolutePath: indexPath,
      content: `export * from "./${fileName}"\n`,
    })
  }

  if (!filesCreated.length) return { matched: false }
  return { matched: true, filesCreated }
}
