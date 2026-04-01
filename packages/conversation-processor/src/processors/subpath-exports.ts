// @paladin/conversation-processor/processors/subpath-exports.ts

import { join } from "path"
import { existsSync } from "fs"
import type { Processor, FileOp, IncomingFile } from "../types"

/**
 * detects subpath imports like `@paladin/fcache/utils`
 * and patches the target package's exports field.
 *
 * resolves the export target by checking for:
 *   1. src/utils.ts        (flat file)
 *   2. src/utils/index.ts  (directory with index)
 */
export const subpathExports: Processor = {
  name: "subpath-exports",

  run(pkg, pipeline) {
    const exportsByPackage = new Map<string, Map<string, string>>()

    for (const file of pkg.incomingFiles) {
      for (const imp of file.imports) {
        if (imp.kind !== "workspace") continue

        const parsed = parseSubpath(imp.specifier)
        if (!parsed) continue
        const { packageName, scopedName, subpath } = parsed

        if (
          !pipeline.workspacePackages.has(packageName)
          && (!scopedName || !pipeline.workspacePackages.has(scopedName))
        ) {
          continue
        }

        const targetPkg = pipeline.packages.get(packageName)
        const targetDir = targetPkg?.dir ?? join(
          pipeline.workspaceRoot, "packages", packageName,
        )

        const resolved = resolveExportTarget(
          subpath,
          targetDir,
          targetPkg?.incomingFiles ?? [],
        )
        if (!resolved) continue

        if (!exportsByPackage.has(packageName)) {
          exportsByPackage.set(packageName, new Map())
        }

        const exports = exportsByPackage.get(packageName)!
        exports.set(`./${subpath}`, resolved)
      }
    }

    const ops: FileOp[] = []

    for (const [packageName, exports] of exportsByPackage) {
      const targetPkg = pipeline.packages.get(packageName)
      const dir = targetPkg?.dir ?? join(
        pipeline.workspaceRoot, "packages", packageName,
      )

      ops.push({
        kind: "patch-json",
        path: join(dir, "package.json"),
        merge: {
          exports: Object.fromEntries(exports),
        },
        reason: "exports",
      })
    }

    return ops
  },
}

function resolveExportTarget(
  subpath: string,
  dir: string,
  incomingFiles: IncomingFile[],
): string | null {
  const candidates = [
    `src/${subpath}.ts`,
    `src/${subpath}/index.ts`,
  ]

  const incomingPaths = new Set(incomingFiles.map(f => f.relativePath))

  for (const candidate of candidates) {
    if (incomingPaths.has(candidate) || existsSync(join(dir, candidate))) {
      return `./${candidate}`
    }
  }

  return null
}

type ParsedSubpath = {
  packageName: string
  scopedName?: string
  subpath: string
}

function parseSubpath(specifier: string): ParsedSubpath | null {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/")
    if (parts.length < 3) return null
    if (parts.length > 3) throw new Error(`deep subpath not allowed: ${specifier}`)
    return {
      packageName: parts[1],
      scopedName: `${parts[0]}/${parts[1]}`,
      subpath: parts[2],
    }
  }

  const parts = specifier.split("/")
  if (parts.length < 2) return null
  if (parts.length > 2) throw new Error(`deep subpath not allowed: ${specifier}`)
  return {
    packageName: parts[0],
    subpath: parts[1],
  }
}
