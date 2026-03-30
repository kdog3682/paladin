// @paladin/conversation-processor/parse-conversation.ts

import { existsSync } from "fs"
import { join } from "path"
import type { ConversationData, IncomingFile, PkgContext, FileOp } from "./types"
import type { FileTracker } from "./file-tracker"
import { extractHeader } from "./utils/extract-header"
import { getImports } from "./utils/parse-imports"
import { resolvePath, extractPackageInfo } from "./utils/path"
import { prepareContent } from "./utils/prepare-content"

type ParseResult = {
  packages: Map<string, PkgContext>
  rootOps: FileOp[]
}

export function parseConversation(
  conversation: ConversationData,
  baseDir: string,
  tracker: FileTracker,
): ParseResult {
  const packages = new Map<string, PkgContext>()
  const rootOps: FileOp[] = []

  const deduped = dedupeArtifacts(conversation.artifacts)
  const projectName = deriveProjectName(deduped)
  const workspaceRoot = projectName ? join(baseDir, projectName) : null

  for (const artifact of deduped) {
    const header = extractHeader(artifact.content)
    if (!header) continue

    const { rawPath, action } = header

    if (!tracker.isStale(rawPath, artifact.updatedAt)) continue

    const absolutePath = resolvePath(rawPath, baseDir)
    const content = prepareContent(artifact.content, absolutePath)

    tracker.set(rawPath, artifact.updatedAt)

    const info = workspaceRoot ? extractPackageInfo(absolutePath, workspaceRoot) : null

    if (!info) {
      rootOps.push(
        action === "delete"
          ? { kind: "delete", path: absolutePath }
          : { kind: "write", path: absolutePath, content },
      )
      continue
    }

    const { packageName } = info
    const dir = join(workspaceRoot, "packages", packageName)
    const isNew = !existsSync(join(dir, "package.json"))
    const status = existsSync(absolutePath) ? "modified" : "created"

    const file: IncomingFile = {
      path: absolutePath,
      content,
      imports: projectName ? getImports(content, projectName) : [],
      status,
      action,
    }

    if (packages.has(packageName)) {
      packages.get(packageName)!.incomingFiles.push(file)
    } else {
      packages.set(packageName, {
        name: packageName,
        dir,
        isNew,
        packageJson: isNew
          ? { name: packageName, version: "0.0.0", type: "module" }
          : require(join(dir, "package.json")),
        incomingFiles: [file],
      })
    }
  }

  return { packages, rootOps }
}

function deriveProjectName(artifacts: ConversationData["artifacts"]): string | null {
  for (const artifact of artifacts) {
    const header = extractHeader(artifact.content)
    if (!header) continue

    const match = header.rawPath.match(/^@(\w+)\//)
    if (match) return match[1]
  }

  return null
}

function dedupeArtifacts(artifacts: ConversationData["artifacts"]) {
  const byPath = new Map<string, ConversationData["artifacts"][number]>()

  for (const artifact of artifacts) {
    const header = extractHeader(artifact.content)
    if (!header) continue

    const existing = byPath.get(header.rawPath)
    if (!existing || artifact.updatedAt > existing.updatedAt) {
      byPath.set(header.rawPath, artifact)
    }
  }

  return [...byPath.values()]
}
