import { $ } from "bun"
import { resolve } from "node:path"

/**
 * For each repo (argv paths, defaulting to paladin + mathpen):
 *   1. errors if the current branch is not `dev`
 *   2. checks out `main`, merges `dev`, pushes `main`
 *   3. always switches back to `dev`
 *
 * usage: bun push-git-repos.ts [repoPath...]
 */

async function currentBranch(cwd: string): Promise<string> {
	return (await $`git rev-parse --abbrev-ref HEAD`.cwd(cwd).text()).trim()
}

export async function pushGitRepo(cwd: string): Promise<void> {
	const branch = await currentBranch(cwd)
	if (branch !== "dev") {
		throw new Error(`[${cwd}] expected to be on "dev" but on "${branch}"`)
	}

	try {
		await $`git checkout main`.cwd(cwd)
		await $`git merge dev`.cwd(cwd)
		await $`git push origin main`.cwd(cwd)
	} finally {
		await $`git checkout dev`.cwd(cwd)
	}
}

const DEFAULT_REPOS = [
	"/home/kdog3682/projects/paladin",
	"/home/kdog3682/projects/mathpen",
]

export async function pushGitRepos(paths: string[]): Promise<void> {
	const repos = paths.length ? paths.map((p) => resolve(p)) : DEFAULT_REPOS
	for (const repo of repos) {
		await pushGitRepo(repo)
		console.log(`pushed ${repo} -> main, back on dev`)
	}
}

if (import.meta.main) {
	try {
		await pushGitRepos(process.argv.slice(2))
	} catch (err) {
		console.error(err instanceof Error ? err.message : err)
		process.exit(1)
	}
}
