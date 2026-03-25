// @paladin/package-management/lib/tags.ts

import type { GitRepo } from "./git"

const TAG_PREFIX = "deprecated/"

export interface ParsedTag {
  name: string
  packageName: string
  version: number
  raw: string
}

export function buildTagName(packageName: string, version: number): string {
  return `${TAG_PREFIX}${packageName}/v${version}`
}

export function parseTag(tag: string): ParsedTag | null {
  const match = tag.match(/^deprecated\/(.+)\/v(\d+)$/)
  if (!match) return null
  return {
    name: match[1],
    packageName: match[1],
    version: parseInt(match[2], 10),
    raw: tag,
  }
}

export async function listTagsForPackage(
  git: GitRepo,
  packageName: string
): Promise<ParsedTag[]> {
  const pattern = `${TAG_PREFIX}${packageName}/v*`
  const raw = await git.listTags(pattern)
  return raw
    .map(parseTag)
    .filter((t): t is ParsedTag => t !== null)
    .sort((a, b) => a.version - b.version)
}

export async function resolveVersion(
  git: GitRepo,
  packageName: string,
  version: "latest" | "oldest" | `v${number}` | number
): Promise<ParsedTag | null> {
  const tags = await listTagsForPackage(git, packageName)
  if (tags.length === 0) return null

  if (version === "latest") return tags[tags.length - 1]
  if (version === "oldest") return tags[0]

  const num = typeof version === "number"
    ? version
    : parseInt(String(version).replace(/^v/, ""), 10)

  return tags.find(t => t.version === num) ?? null
}

export async function nextVersion(
  git: GitRepo,
  packageName: string
): Promise<number> {
  const tags = await listTagsForPackage(git, packageName)
  if (tags.length === 0) return 1
  return tags[tags.length - 1].version + 1
}
