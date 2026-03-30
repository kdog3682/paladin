// @paladin/utils/tempwrite.ts

import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"
import { homedir } from "os"
import { $ } from "bun"

export async function tempwrite(content: string) {
  const dir = process.env.TMP_DIR || join(homedir(), ".tmp")
  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, "tempwrite.txt")
  writeFileSync(outPath, content, "utf-8")
  await $`python3 -m webbrowser ${outPath}`
  return outPath
}
