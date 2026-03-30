// @paladin/conversation-processor/processors/package-json.ts

import { join } from "path"
import type { Processor, FileOp } from "../types"

export const packageJson: Processor = {
  name: "package-json",

  run(pkg, pipeline) {
    const ops: FileOp[] = []
    const deps: Record<string, string> = {}
    const workspaceDeps: Record<string, string> = {}

    for (const file of pkg.incomingFiles) {
      for (const imp of file.imports) {
        if (imp.kind === "relative") continue

        if (imp.kind === "workspace") {
          workspaceDeps[imp.specifier] = "workspace:*"
          continue
        }

        if (imp.kind === "external" && imp.version) {
          deps[imp.specifier] = `^${imp.version}`
        }
      }
    }

    const hasDeps = Object.keys(deps).length > 0
    const hasWorkspaceDeps = Object.keys(workspaceDeps).length > 0

    if (!hasDeps && !hasWorkspaceDeps) return ops

    const pkgJsonPath = join(pkg.dir, "package.json")

    if (pkg.isNew) {
      ops.push({
        kind: "write-json",
        path: pkgJsonPath,
        data: {
          ...pkg.packageJson,
          dependencies: { ...deps, ...workspaceDeps },
        },
      })
    } else {
      ops.push({
        kind: "patch-json",
        path: pkgJsonPath,
        merge: {
          dependencies: { ...deps, ...workspaceDeps },
        },
        reason: "deps",
      })
    }

    return ops
  },
}
