// @paladin/conversation-processor/pipeline.ts
//
// Main pipeline for converting a Claude conversation into a workspace project.
// Steps: parse artifacts → bootstrap dirs → hydrate imports → write files → run processors → execute ops

import { existsSync } from "fs"
import { join } from "path"
import type {
  ConversationData,
  PipelineContext,
  Processor,
  FileOp,
  ProjectData,
} from "./types"
import { parseConversation } from "./parse-conversation"
import { hydrateImports } from "./hydrate-imports"
import { createFileTracker } from "./file-tracker"
import { bootstrap, inferTemplateKey } from "./bootstrap"
import { execute } from "./executor"
import { discoverWorkspacePackages } from "./utils/discover-workspace"
import { extractHeader } from "./utils/extract-header"
import { packageJson } from "./processors/package-json"
import { subpathExports } from "./processors/subpath-exports"

const DEFAULT_PROCESSORS: Processor[] = [
  packageJson,
  subpathExports,
]

export type PipelineOptions = {
  baseDir?: string
  processors?: Processor[]
}

export async function runPipeline(
  conversation: ConversationData,
  options: PipelineOptions = {},
): Promise<ProjectData | null> {
  const {
    baseDir = process.env.PROJECTS_DIR!,
    processors = DEFAULT_PROCESSORS,
  } = options

  // derive project name and workspace root from the first valid artifact header
  const info = getProjectInfo(conversation, baseDir)
  if (!info) return null

  const { projectName, workspaceRoot } = info
  const storageRoot = join(baseDir, ".paladin")
  const tracker = await createFileTracker(projectName, storageRoot)
  const workspacePackages = await discoverWorkspacePackages(workspaceRoot)
  const isNewRoot = !existsSync(workspaceRoot)
  const ops: FileOp[] = []

  // 1. bootstrap project root if it doesn't exist yet
  if (isNewRoot) {
    const rootOps = await bootstrap({
      dir: workspaceRoot,
      projectName,
      key: "root",
    })
    ops.push(...rootOps)
  }

  // 2. parse conversation artifacts into per-package file maps
  const { packages, rootOps } = parseConversation(
    conversation, baseDir, tracker,
  )
  ops.push(...rootOps)

  if (packages.size === 0 && rootOps.length === 0) {
    await tracker.flush()
    return null
  }

  // 3. bootstrap new packages with inferred templates (e.g. "react", "lib")
  for (const pkg of packages.values()) {
    if (!pkg.isNew) continue
    const key = inferTemplateKey(pkg.incomingFiles)
    const bootstrapOps = await bootstrap({
      dir: pkg.dir,
      projectName,
      packageName: pkg.name,
      key,
    })
    ops.push(...bootstrapOps)
    workspacePackages.add(pkg.name)
  }

  // 4. resolve bare imports to versioned dependencies
  await hydrateImports(packages, workspaceRoot, workspacePackages)

  // 5. convert incoming files to write/append/delete ops
  for (const pkg of packages.values()) {
    for (const file of pkg.incomingFiles) {
      if (file.action === "delete") {
        ops.push({ kind: "delete", path: file.path })
      } else if (file.action === "append") {
        ops.push({ kind: "append", path: file.path, content: file.content })
      } else {
        ops.push({ kind: "write", path: file.path, content: file.content })
      }
    }
  }

  // 6. run processors (package.json generation, subpath exports, etc.)
  const pipeline: PipelineContext = {
    workspaceRoot,
    workspacePackages,
    packages,
  }

  for (const pkg of packages.values()) {
    for (const processor of processors) {
      ops.push(...processor.run(pkg, pipeline))
    }
  }

  // 7. execute all accumulated file ops
  const executorResult = await execute(ops, workspaceRoot)

  // 8. persist tracked file state
  await tracker.flush()

  // 9. build the final output summary
  const files = [...packages.values()].flatMap(pkg =>
    pkg.incomingFiles.map(f => ({
      path: join("packages", pkg.name, f.relativePath),
      status: f.status,
    })),
  )

  return {
    name: projectName,
    rootDir: workspaceRoot,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    isNew: isNewRoot,
    files,
    bashResults: executorResult.bashResults,
  }
}

/** Scans conversation artifacts to find the project scope (e.g. @paladin/...) */
function getProjectInfo(conversation: ConversationData, baseDir: string) {
  for (const artifact of conversation.artifacts) {
    const header = extractHeader(artifact.content)
    if (!header) continue

    const match = header.rawPath.match(/^@(\w+)\//)
    if (!match) continue

    return {
      projectName: match[1],
      workspaceRoot: join(baseDir, match[1]),
    }
  }

  return null
}
