// Diagnostic test: reproduces the JSON parse crash that occurs when
// readManifest encounters a package.json with a trailing comma.
// Root cause: @paladin/ai/package.json ends with  },\n}  — invalid JSON.
import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { prepareTypescript } from './typescript'

const BASE = '/tmp/scaffold-diagnose-test'
const CLAUDE_CODE_CONTENT = `// @paladin/ai/claudeCode.ts
import { $ } from "bun"
import { randomUUID } from "crypto"

export async function claude(prompt: string): Promise<string> {
  const result = await $\`claude -p \${prompt}\`.text()
  return result
}
`

beforeAll(() => {
  rmSync(BASE, { recursive: true, force: true })
  mkdirSync(BASE, { recursive: true })

  // Simulate the broken @paladin/ai package.json (trailing comma = invalid JSON)
  const aiPkgDir = join(BASE, 'paladin', 'packages', 'ai')
  mkdirSync(aiPkgDir, { recursive: true })
  writeFileSync(
    join(aiPkgDir, 'package.json'),
    `{
  "name": "@paladin/ai",
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39"
  },
}
`,
  )
})

afterAll(() => {
  rmSync(BASE, { recursive: true, force: true })
})

test('prepareTypescript throws when existing package.json has trailing comma', async () => {
  const opts = {
    baseProjectDir: BASE,
    git: { initLocalRepo: false, initRemoteRepository: false },
  }

  await expect(prepareTypescript([CLAUDE_CODE_CONTENT], opts)).rejects.toThrow(
    /JSON/i,
  )
})

test('valid package.json with same content does not throw', async () => {
  // Overwrite with valid JSON (no trailing comma)
  const aiPkgDir = join(BASE, 'paladin', 'packages', 'ai')
  writeFileSync(
    join(aiPkgDir, 'package.json'),
    `{
  "name": "@paladin/ai",
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39"
  }
}
`,
  )

  const opts = {
    baseProjectDir: BASE,
    git: { initLocalRepo: false, initRemoteRepository: false },
  }

  // Should not throw — result may be null if no new deps are needed
  const result = await prepareTypescript([CLAUDE_CODE_CONTENT], opts)
  expect(result === null || typeof result === 'object').toBe(true)
})
