// @paladin/scaffold-v3/scaffold/resolve-path.ts

import { join, basename, extname } from "path"
import { expandHome } from "@paladin/utils/fs"
import { TS_EXTS, SOURCE_EXCLUDED } from "../constants"

export interface ResolvedPath {
  absolutePath: string
  relativePath: string
  packageName: string | null
  packageDir: string | null
}

function isSourceFile(filename: string): boolean {
  if (SOURCE_EXCLUDED.some(p => p.test(filename))) return false
  return TS_EXTS.has(extname(filename))
}

export function resolvePath(
  header: string,
  projectDir: string,
  projectName: string,
  workspaceFolders: string[],
  defaultWorkspaceFolder: string,
): ResolvedPath {
  const prefix = `@${projectName}/`

  if (header.startsWith("/") || header.startsWith("~/")) {
    const abs = expandHome(header)
    return { absolutePath: abs, relativePath: header, packageName: null, packageDir: null }
  }

  if (header.startsWith("./")) {
    const rel = header.slice(2)
    return { absolutePath: join(projectDir, rel), relativePath: rel, packageName: null, packageDir: null }
  }

  if (!header.includes("/")) {
    return { absolutePath: join(projectDir, header), relativePath: header, packageName: null, packageDir: null }
  }

  const rel = header.startsWith(prefix) ? header.slice(prefix.length) : header
  const name = basename(rel)

  if (!isSourceFile(name)) {
    return { absolutePath: join(projectDir, rel), relativePath: rel, packageName: null, packageDir: null }
  }

  const parts = rel.split("/")
  const isExplicitWs = workspaceFolders.includes(parts[0])

  const packageName = isExplicitWs ? parts[1] : parts[0]
  const packageDir = isExplicitWs
    ? join(projectDir, parts[0], parts[1])
    : join(projectDir, defaultWorkspaceFolder, packageName)
  const filePath = isExplicitWs
    ? parts.slice(2).join("/")
    : parts.slice(1).join("/")

  const withSrc = filePath.startsWith("src/") || filePath.includes("/src/")
    ? filePath
    : `src/${filePath}`

  return {
    absolutePath: join(packageDir, withSrc),
    relativePath: withSrc,
    packageName,
    packageDir,
  }
}
