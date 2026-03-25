// @paladin/package-management/lib/workspace.ts

import { readFile } from "fs/promises"
import { join } from "path"

export async function readWorkspaces(root: string): Promise<string[]> {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"))
  return pkg.workspaces ?? []
}
