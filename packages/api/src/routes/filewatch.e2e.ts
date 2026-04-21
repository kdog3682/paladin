// spawns the real api (bun --watch) and drops a conversation into SCRATCH_DIR.
// asserts resolve-path.ts + resolve-path.demo.ts land on disk,
// and that run() fires exactly the expected number of times (no loop).

import { spawn } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildConversation,
  makeArtifact,
  writeConversation,
  incrementArtifact,
} from "../utils/conversation-test-utils"
import { glob } from "../utils/fs"

const HARD_TIMEOUT_MS = 20_000
const MAX_RUNS = 2 // 1 initial + 1 increment
const RUN_MARKER = /filewatch:session|processConversation|wrote:/i

const scratch = await mkdtemp(join(tmpdir(), "fw-scratch-"))
const projects = await mkdtemp(join(tmpdir(), "fw-projects-"))
console.log("scratch:", scratch)
console.log("projects:", projects)

let runCount = 0
let aborted = false

async function cleanup(code: number, reason: string) {
  console.log(`cleanup: ${reason}`)
  try {
    api.kill()
  } catch {}
  await rm(scratch, { recursive: true, force: true })
  await rm(projects, { recursive: true, force: true })
  process.exit(code)
}

// hard timeout — no matter what, kill it
const hardTimeout = setTimeout(() => {
  aborted = true
  cleanup(2, `hard timeout after ${HARD_TIMEOUT_MS}ms`)
}, HARD_TIMEOUT_MS)

// spawn api
const api = spawn({
  cmd: ["bun", "--watch", "src/api.ts"],
  env: {
    ...process.env,
    SCRATCH_DIR: scratch,
    BASE_PROJECTS_DIR: projects,
    FILEWATCH_DRY_RUN: "1",
    PORT: "3999",
  },
  stdout: "pipe",
  stderr: "pipe",
})

// stream stdout, count runs, abort on runaway
async function watchStream(
  stream: ReadableStream<Uint8Array> | null,
  label: string,
) {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  while (!aborted) {
    const { value, done } = await reader.read()
    if (done) return
    buf += decoder.decode(value)
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      process.stdout.write(`[${label}] ${line}\n`)
      if (RUN_MARKER.test(line)) {
        runCount++
        if (runCount > MAX_RUNS) {
          aborted = true
          clearTimeout(hardTimeout)
          await cleanup(
            3,
            `infinite loop detected: runCount=${runCount}`,
          )
        }
      }
    }
  }
}

watchStream(api.stdout, "api")
watchStream(api.stderr, "api!")

// wait for boot
await new Promise((r) => setTimeout(r, 1500))

const conv = buildConversation({
  url: "https://claude.ai/chat/e2e-resolve-path",
  title: "resolve-path e2e",
  userText: "write resolve-path.ts and its demo",
  artifacts: [
    makeArtifact({
      path: "src/utils/resolve-path.ts",
      content: `
export function resolvePath(p: string) {
  return p.startsWith('/') ? p : './' + p
}
`,
    }),
    makeArtifact({
      path: "src/utils/resolve-path.demo.ts",
      content: `
import { resolvePath } from './resolve-path'

console.log(resolvePath('foo'))
console.log(resolvePath('/abs'))
`,
    }),
  ],
})

process.env.SCRATCH_DIR = scratch
const jsonPath = await writeConversation(conv)
console.log("wrote:", jsonPath)

// wait for initial run
await new Promise((r) => setTimeout(r, 3000))

// increment to verify one additional run (and no more)
await incrementArtifact(jsonPath)
await new Promise((r) => setTimeout(r, 3000))

// assertions
const files = await glob(projects, "**/resolve-path*.{ts,tsx}")
const hasMain = files.some((f) => f.endsWith("resolve-path.ts"))
const hasDemo = files.some((f) => f.endsWith("resolve-path.demo.ts"))

console.log("files:", files)
console.log("runCount:", runCount)
console.log("hasMain:", hasMain, "hasDemo:", hasDemo)

clearTimeout(hardTimeout)

if (!hasMain || !hasDemo) await cleanup(1, "missing expected files")
if (runCount < 1) await cleanup(1, "run() never fired")
if (runCount > MAX_RUNS)
  await cleanup(1, `too many runs: ${runCount}`)

await cleanup(0, "ok")
