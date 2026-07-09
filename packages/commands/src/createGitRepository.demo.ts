import { homedir } from "node:os"
import { join } from "node:path"
import { createGitRepository } from "./createGitRepository"

const dir = join(homedir(), ".paladin")

const result = await createGitRepository(dir, {
  name: "paladin-system",
  remote: true,
  gitignore: "*.txt\n",
  visibility: "private",
  autoCommitAndPush: true,
})

console.log(result)
