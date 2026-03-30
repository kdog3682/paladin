// @paladin/conversation-processor/pipeline.ts

import { existsSync } from "fs"
import { join } from "path"
import type {
  ConversationData,
  ConversationRef,
  PipelineContext,
  Processor,
  FileOp,
  ProjectData,
} from "./types"
import { parseConversation } from "./parse-conversation"
import { hydrateImports } from "./hydrate-imports"
import { createFileTracker } from "./file-tracker"
import { bootstrap, inferTemplateKey } from "./bootstrap"
import { execute, type OpHandler } from "./executor"
import { discoverWorkspacePackages } from "./utils/discover-workspace"
import { extractHeader } from "./utils/extract-header"
import { createProjectRegistry } from "./project-registry"
import { packageJson } from "./processors/package-json"
import { subpathExports } from "./processors/subpath-exports"

const DEFAULT_PROCESSORS: Processor[] = [
  packageJson,

import { packageJson } from "./processors/package-json"
  subpathExports,
]

export type PipelineOptions = {
  baseDir?: string
  processors?: Processor[]
  handlers?: OpHandler[]
}

export async function runPipeline(
  conversation: ConversationData,
  options: PipelineOptions = {},
): Promise<ProjectData | null> {
  const {
    projectsDir = process.env.PROJECTS_DIR!,
    processors = DEFAULT_PROCESSORS,
    handlers = [],
  } = options

  const info = getProjectInfo(conversation, projectsDir)
  if (!info) return null

  const { projectName, workspaceRoot } = info
  const tracker = await createFileTracker(projectName)
  const workspacePackages = await discoverWorkspacePackages(workspaceRoot)
  const isNewRoot = !existsSync(workspaceRoot)
  const ops: FileOp[] = []

  // 1. bootstrap project root if new
  if (isNewRoot) {
    const rootOps = await bootstrap({
      dir: workspaceRoot,
      projectName,
      key: "root",
    })
    ops.push(...rootOps)
  }

  // 2. parse
  const { packages, rootOps } = parseConversation(
    conversation, baseDir, tracker,
  )
  ops.push(...rootOps)

  if (packages.size === 0 && rootOps.length === 0) {
    await tracker.flush()
    return null
  }

  // 3. bootstrap new packages
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

  // 4. hydrate imports with versions
  await hydrateImports(packages, workspaceRoot, workspacePackages)

  // 5. write incoming files
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

  // 6. run processors
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

  // 7. execute
  const executorResult = await execute(ops, workspaceRoot, handlers)

  // 8. flush tracker
  await tracker.flush()

  // 9. accumulate conversation refs
  const registry = createProjectRegistry()
  const ref: ConversationRef = {
    id: conversation.id,
    url: conversation.url,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  }
  registry.addRef(projectName, ref)
  const conversationRefs = registry.getRefs(projectName)
  registry.close()

  // 10. build output
  const files = [...packages.values()].flatMap(pkg =>
    pkg.incomingFiles.map(f => ({
      path: join("packages", pkg.name, f.relativePath),
      status: f.status,
    })),
  )

  return {
    name: projectName,
    rootDir: workspaceRoot,
    conversationRefs,
    isNew: isNewRoot,
    files,
    bashResults: executorResult.bashResults,
    handlerResults: executorResult.handlerResults,
  }
}

function getProjectInfo(conversation: ConversationData, baseDir: string) {
  for (const artifact of conversation.artifacts) {
    const header = extractHeader(artifact.content)
    if (!header) continue
    if (header.action === "delete") continue

    const match = header.rawPath.match(/^@(\w+)\//)
    if (!match) continue

    return {
      projectName: match[1],
      workspaceRoot: join(baseDir, match[1]),
    }
  }

  return null
}
