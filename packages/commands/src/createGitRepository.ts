import { $ } from "bun"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"

type Visibility = "private" | "public"

interface CreateGitRepositoryOptions {
  name: string
  remote?: boolean
  gitignore?: string | null
  visibility?: Visibility
  autoCommitAndPush?: boolean
}

export async function createGitRepository(
  dir: string,
  options: CreateGitRepositoryOptions,
) {
  const {
    name,
    remote = false,
    gitignore = null,
    visibility = "private",
    autoCommitAndPush = true,
  } = options

  const token = process.env.KDOG3682_GITHUB_API_KEY
  if (remote && !token) throw new Error("missing KDOG3682_GITHUB_API_KEY")

  const alreadyGit = existsSync(join(dir, ".git"))
  if (!alreadyGit) await $`git init`.cwd(dir).quiet()

  if (gitignore != null) await writeFile(join(dir, ".gitignore"), gitignore)

  if (autoCommitAndPush) {
    await $`git add -A`.cwd(dir).quiet()
    const status = await $`git status --porcelain`.cwd(dir).quiet().text()
    if (status.trim().length > 0)
      await $`git commit -m ${"initial commit"}`.cwd(dir).quiet()
  }

  if (remote) {
    const visibilityFlag = visibility === "public" ? "--public" : "--private"
    const env = { ...process.env, GH_TOKEN: token }
    const push = autoCommitAndPush ? ["--push"] : []
    await $`gh repo create ${name} ${visibilityFlag} --source ${dir} --remote origin ${push}`
      .cwd(dir)
      .env(env)
      .quiet()
  }

  return { dir, name, remote, alreadyGit }
}
