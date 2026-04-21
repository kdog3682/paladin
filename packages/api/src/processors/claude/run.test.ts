
import { spawn } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildConversation,
  makeArtifact,
  writeConversation,
  incrementArtifact,
} from "../../utils/conversation-test-utils"
import { glob, collectFiles } from "../../utils/fs"
import {run} from "./run"


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
// resolve path
console.log(resolvePath('foo'))
console.log(resolvePath('/abs'))
`,
    }),
  ],
})

const result = await run(conv, {dryRun: true, force: true, baseProjectsDir: '/tmp/projects'})
console.log(result

  )
