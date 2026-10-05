import { existsSync } from "node:fs"
import { join } from "node:path"
import { bash, type BashResult } from "../bash/bash.ts"

/* run git in `dir`, never throws */
export function git(dir: string, args: string[]): Promise<BashResult> {
  return bash(["git", ...args], { cwd: dir })
}

/* run git in `dir` and return stdout, throws on a non-zero exit */
export async function gitOut(dir: string, args: string[]): Promise<string> {
  const result = await git(dir, args)
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout
}

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"))
}

/* absolute path of the repo containing `dir` (works from any subdirectory) */
export async function getRepoRoot(dir: string): Promise<string> {
  return (await gitOut(dir, ["rev-parse", "--show-toplevel"])).trim()
}

/* whether the repo has at least one commit */
export async function hasHead(dir: string): Promise<boolean> {
  return (await git(dir, ["rev-parse", "--verify", "-q", "HEAD"])).exitCode === 0
}

/* whether a repo-relative file or directory exists in HEAD, false when there is no HEAD */
export async function existsAtHead(dir: string, path: string): Promise<boolean> {
  return (await git(dir, ["cat-file", "-e", `HEAD:${path}`])).exitCode === 0
}
