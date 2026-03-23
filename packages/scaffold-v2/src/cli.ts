// @paladin/scaffold-v2/cli.ts

import { watch } from "fs"
import { readFile, stat } from "fs/promises"
import { join } from "path"
import { scaffold } from "./scaffold"

const WATCH_DIR = process.env.SCRATCH_DIR
if (!WATCH_DIR) {
  console.error("SCRATCH_DIR is not set")
  process.exit(1)
}

async function waitForStable(path: string, { interval = 50, timeout = 2000 } = {}) {
  let lastSize = -1
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const s = await stat(path).catch(() => null)
    if (s && s.size > 0 && s.size === lastSize) return
    if (s) lastSize = s.size
    await Bun.sleep(interval)
  }
}

watch(WATCH_DIR, async (event, filename) => {
  if (event !== "rename" || !filename) return
  if (!filename.endsWith(".json") || filename.endsWith(".crdownload")) return

  const filepath = join(WATCH_DIR, filename)
  await waitForStable(filepath)

  const raw = await readFile(filepath, "utf-8").catch(() => null)
  if (!raw) return

  const conversation = JSON.parse(raw)
  const artifacts = conversation.artifacts ?? []
  if (!artifacts.length) return

  const result = await scaffold(artifacts)
  const rel = result.files.map(f => f.replace(result.projectDir + "/", ""))
  console.log(`${result.projectName} → ${rel.length} files`)
  for (const pkg of result.packages) {
    const tag = pkg.isNew ? "(new)" : ""
    console.log(`  ${pkg.packageName} ${tag} [${pkg.files.length} files, ${pkg.newDependenciesInstalled.length} deps]`)
  }
})

console.log(`watching ${WATCH_DIR}`)
