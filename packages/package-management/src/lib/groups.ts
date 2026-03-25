// @paladin/package-management/lib/groups.ts

import type { GitRepo } from "./git"

export interface GroupInfo {
  members: string[]
  restoredFrom?: string
}

export async function readGroup(git: GitRepo, tag: string): Promise<GroupInfo> {
  const message = await git.readTagMessage(tag)
  const parsed = JSON.parse(message)
  return {
    members: parsed.group ?? [],
    restoredFrom: parsed.restoredFrom ?? undefined,
  }
}

export function buildTagMessage(group: string[], restoredFrom?: string): string {
  const payload: Record<string, unknown> = { group }
  if (restoredFrom) payload.restoredFrom = restoredFrom
  return JSON.stringify(payload)
}
