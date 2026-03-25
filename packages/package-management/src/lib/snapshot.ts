// @paladin/package-management/lib/snapshot.ts

import type { GitRepo } from "./git"
import type { ParsedTag } from "./tags"
import { readGroup, type GroupInfo } from "./groups"

export interface SnapshotFile {
  path: string
  content: string
}

export interface Snapshot {
  packageName: string
  version: number
  tag: string
  group: GroupInfo
  files: SnapshotFile[]
}

export interface SnapshotMeta {
  packageName: string
  version: number
  tag: string
  group: GroupInfo
  fileCount: number
}

export async function readSnapshot(
  git: GitRepo,
  parsed: ParsedTag,
  packageDir: string
): Promise<Snapshot> {
  const group = await readGroup(git, parsed.raw)
  const paths = await git.listTree(parsed.raw, packageDir)

  const files: SnapshotFile[] = await Promise.all(
    paths.map(async (p) => ({
      path: p,
      content: await git.showFile(parsed.raw, p),
    }))
  )

  return {
    packageName: parsed.packageName,
    version: parsed.version,
    tag: parsed.raw,
    group,
    files,
  }
}

export async function readSnapshotMeta(
  git: GitRepo,
  parsed: ParsedTag,
  packageDir: string
): Promise<SnapshotMeta> {
  const group = await readGroup(git, parsed.raw)
  const paths = await git.listTree(parsed.raw, packageDir)

  return {
    packageName: parsed.packageName,
    version: parsed.version,
    tag: parsed.raw,
    group,
    fileCount: paths.length,
  }
}
