// src/processors/claude/run.ts

import { processConversation } from "./process"
import { findProjectRoot } from "./utils/find-root"
import { extractUserText, collectUserUuids } from "./utils/extract-user-text"
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

export async function run(conversation: Conversation): Promise<SessionData | null> {
  const result = processConversation(conversation, config.baseProjectsDir)
  if (!result) {
    console.log("no result from processConversation. no files")
    return null
   }
  const { files } = result
  // console.log(result)
  // 1. derive project from one of the file paths
  const project = findProjectRoot(files[0].path, config.baseProjectsDir)
  if (!project) {
console.log('unable to find a project root')
    return null
}
// console.log(files.map(x => x.path))
// return

  // 2. emit partial session at the start
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

  // 3. write files via fcache (skips unchanged)
  const paths = []

  for (const file of files) {
    const path = await fcache.write(file.path, file.content, {force: true})
    if (path) paths.push(path)
  }
  
  // todo
  // sets up drizzle if necessary, connections to App.tsx
  // injects additional route files and what not
  // const morePaths = await ensureConnectiveTissues(paths)
const morePaths = []

  // 4. bootstrap monorepo
  await bootstrapMonorepo(project.dir, [...paths, ...morePaths])




  // 5. set up git
  await git.setRepo(project.dir, { autoInit: true })

  // 6. collect + run handlers
  const runResults = await codeRunner.run(paths)



  // 9. stage + read final git state
  await git.add('.')
  const gitState = await git.getData()

  // 10. generate commit message if all tests pass (or no tests ran)
  const testsOk = runResults.every((r) => r.name !== "test" || r.success)

  let commitMessage: string | undefined
  if (testsOk) {
    const seen = await getSeenUuids(conversation.url)
    const userText = extractUserText(conversation.messages, seen)
    if (userText) {
      commitMessage = await generateCommitMessage(userText)
      await setSeenUuids(conversation.url, collectUserUuids(conversation.messages))
      await git.commit(commitMessage) // commit the message
    }
  }


  // 9. emit full session
  const session: SessionData = {
    conversation: conversationData,
    project,
    git: { ...gitState, commitMessage },
    runResults,
  }

  bus.emit("filewatch:session", session)

  return session
}
