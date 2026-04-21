import { processConversation } from "./process"
import { findProjectRoot } from "./utils/find-root"
import {
  extractUserText,
  collectUserUuids,
} from "./utils/extract-user-text"
import { getSeenUuids, setSeenUuids } from "./utils/seen-cache"
import { generateCommitMessage } from "./utils/generate-commit"
import { bootstrapMonorepo } from "../../services/bootstrap/monorepo"
import { codeRunner } from "../../services/runcode"
import * as git from "../../services/git"
import { fcache } from "../../fcache"
import { bus } from "../../bus"
import { config } from "../../config"
import type { Conversation } from "../../types/claude"
import type { SessionData } from "../../types/session"

export interface RunOptions {
  dryRun?: boolean
  baseProjectsDir?: string
}

export async function run(
  conversation: Conversation,
  opts: RunOptions = {},
): Promise<SessionData | null> {
  const { dryRun = false } = opts

  const baseProjectsDir = opts.baseProjectDir ?? config.baseProjectsDir
  const result = processConversation(
    conversation,
    baseProjectsDir,
  )
  if (!result) {
    console.log("no result from processConversation. no files")
    return null
  }
  const { files } = result

  const project = findProjectRoot(
    files[0].path,
    baseProjectsDir,
  )
  if (!project) {
    console.log("unable to find a project root")
    return null
  }

  const conversationData = {
    id: conversation.url,
    url: conversation.url,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  }

  const partial: SessionData = {
    conversation: conversationData,
    project,
    git: { branch: "", files: [] },
    runResults: [],
  }

  bus.emit("filewatch:session", partial)

  // write files via fcache (skips unchanged)
  const paths = []
  for (const file of files) {
    const path = await fcache.write(file.path, file.content, {
      force: false,
    })
    if (path) paths.push(path)
  }

  const morePaths: string[] = []
  const runResults = await codeRunner.run(paths)

  if (dryRun) {
    const session: SessionData = {
      conversation: conversationData,
      project,
      git: { branch: "", files: [] },
      runResults: runResults,
    }
    bus.emit("filewatch:session", session)
    return session
  }

  // bootstrap monorepo
  await bootstrapMonorepo(project.dir, [...paths, ...morePaths])

  // set up git
  await git.setRepo(project.dir, { autoInit: true })
  const gitState = await git.getData()

  const session: SessionData = {
    conversation: conversationData,
    project,
    git: { ...gitState  },
    runResults,
  }

  bus.emit("filewatch:session", session)

  return session
}
