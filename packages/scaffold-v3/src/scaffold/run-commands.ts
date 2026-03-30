// @paladin/scaffold-v3/scaffold/run-commands.ts

import { bash, type BashResult } from "@paladin/utils/bash"

export async function runCommands(
  commands: { cmd: string[]; cwd: string }[],
): Promise<BashResult[]> {
  const results: BashResult[] = []

  for (const { cmd, cwd } of commands) {
    results.push(await bash(cmd, { cwd }))
  }

  return results
}
