// @paladin/scaffold-v2/cli.ts

import { watch } from "fs"
import { readFile, stat } from "fs/promises"
import { join, basename } from "path"
import { $ } from "bun"
import { scaffold } from "./scaffold/index"
import { tempwrite } from "@paladin/utils/tempwrite"

const WATCH_DIR = process.env.SCRATCH_DIR
const args = process.argv.slice(2)
const watchMode = args.includes("--watch")

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

function logResult(result: Awaited<ReturnType<typeof scaffold>>) {
  const packageFileSet = new Set(
    result.packages.flatMap(pkg =>
      pkg.files.map(f => join(pkg.packageDir, f.relativePath))
    )
  )

  for (const pkg of result.packages) {
    console.log(pkg.packageName)
    for (const f of pkg.files) {
      console.log(`  ${f.relativePath}`)
    }
    for (const dep of pkg.newDependenciesInstalled) {
      console.log(`  + ${dep}`)
    }
  }

  for (const absPath of result.files) {
    if (!packageFileSet.has(absPath)) {
      const rel = absPath.startsWith(result.projectDir + "/")
        ? absPath.slice(result.projectDir.length + 1)
        : absPath
      console.log(rel)
    }
  }
}

async function processFile(filepath: string) {
  const raw = await readFile(filepath, "utf-8").catch(() => null)
  if (!raw) return

  const conversation = JSON.parse(raw)
  const artifacts = conversation.artifacts ?? []
  if (!artifacts.length) return

  const result = await scaffold(artifacts)
  logResult(result)

  const runnable = result.files.filter(f => f.endsWith(".demo.ts") || f.endsWith(".test.ts"))
  if (runnable.length) {
    const sections: string[] = []
    for (const absPath of runnable) {
      const proc = await (absPath.endsWith(".test.ts")
        ? $`bun test ${absPath}`.nothrow()
        : $`bun run ${absPath}`.nothrow())
      const output = [proc.stdout.toString(), proc.stderr.toString()].filter(Boolean).join("\n")
      sections.push(`${basename(absPath)}\n${output}`)
    }
    await tempwrite("output.txt", sections.join("\n========\n"))
  }
}

if (watchMode) {
  if (!WATCH_DIR) {
    console.error("SCRATCH_DIR is not set")
    process.exit(1)
  }

  watch(WATCH_DIR, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (!filename.endsWith(".json") || filename.endsWith(".crdownload")) return

    const filepath = join(WATCH_DIR, filename)
    await waitForStable(filepath)
    await processFile(filepath).catch(e => console.error(e))
  })

  console.clear()
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  console.log(`loaded at ${time} — watching ${WATCH_DIR}`)
} else {
  const filepath = args.find(a => !a.startsWith("--"))
  if (!filepath) {
    console.error("usage: cli.ts <file> | cli.ts --watch")
    process.exit(1)
  }
  await processFile(filepath)
}
