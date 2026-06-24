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

const TEMPLATE = `

  ===
  src/foobar.ts
  ===

  function foobar() {
    return 'foobar'
  }




  ===
  src/foobar.demo.ts
  ===

  import {foobar} from './foobar.ts'

  console.log(foobar())

`
import { parseTemplate } from "../services/bootstrap/monorepo"

export function createArtifactsFromTemplate(
  s: string,
): { path: string; content: string }[] {
  return parseTemplate(s).map(({ path, content }) => ({
    content: `// ${path}\n\n${content}`,
  }))
}

export async function incrementArtifact(
  pathOrConv: string | Conversation,
  key?: string,
): Promise<string> {
  const conv: Conversation =
    typeof pathOrConv === "string"
      ? ((await readFileSafe(pathOrConv)) as Conversation)
      : pathOrConv
  if (!conv) throw new Error(`could not read conversation`)

  // collect all artifact tool_use blocks across assistant messages
  const toolUses = conv.messages
    .filter((m) => m.sender === "assistant")
    .flatMap((m) => m.content)
    .filter((c) => c.type === "tool_use")

  if (!toolUses.length) throw new Error("no artifact tool_use")

  // key matches against artifact content filename (the `// path` header)
  const matches = key
    ? toolUses.filter((t) => {
        const content = (t.input.content.split('\n')[0] as string) ?? ""
        return content.includes(key)
      })
    : toolUses

  if (key && !matches.length)
    throw new Error(`no artifact matching key: ${key}`)

  const stampLine = `// incremented at ${new Date().toISOString()}\n`
  for (const toolUse of matches) {
    const existing = (toolUse.input.content as string) ?? ""
    toolUse.input.content = stampLine + existing
    toolUse.input.version_uuid = randomUUID()
  }

  conv.updatedAt = new Date().toISOString()
  return writeConversation(conv)
}

const payload = buildConversation({artifacts: createArtifactsFromTemplate(TEMPLATE)})
const referenceArtifact = await writeConversation(payload)
console.log(payload)
console.log(referenceArtifact, 'hi')
// incrementArtifact(referenceArtifact, 'foobar.ts')