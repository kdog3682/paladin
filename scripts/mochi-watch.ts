import { tempwrite } from "../packages/utils/src/tempwrite"
import { spawn } from "bun"

const proc = spawn(["bun", "test", "--watch", "packages/mochi"], {
  cwd: "/home/kdog3682/projects/paladin",
  stdout: "pipe",
  stderr: "pipe",
})

const decoder = new TextDecoder()
let runBuffer = ""

async function flush() {
  const content = runBuffer.trim()
  runBuffer = ""
  if (content) {
    await tempwrite(content).catch(console.error)
  }
}

async function processStream(stream: ReadableStream<Uint8Array>) {
  for await (const chunk of stream) {
    const text = decoder.decode(chunk)
    process.stdout.write(text)
    runBuffer += text

    // bun ends each test run with "Ran N tests across M files. [Xms]"
    if (/Ran \d+ tests? across \d+ files?\./.test(runBuffer)) {
      await flush()
    }
  }
}

await Promise.all([
  processStream(proc.stdout),
  processStream(proc.stderr),
])
