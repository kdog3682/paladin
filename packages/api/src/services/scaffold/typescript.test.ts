import { test, expect } from 'bun:test'
import { rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { prepareTypescript } from './typescript'

const BASE_PROJECT_DIR = '/tmp/scaffold-test'
const PROJECT_DIR = `${BASE_PROJECT_DIR}/mathpenny`

rmSync(PROJECT_DIR, { recursive: true, force: true })

const OPTS = { baseProjectDir: BASE_PROJECT_DIR, git: { initLocalRepo: false, initRemoteRepository: false } }

const INITIAL_CONTENTS = [
  `// @mathpenny/manim/index.ts
import { greet } from '@mathpenny/utils'
import _ from 'lodash'

console.log(greet(_.upperCase('manim')))
`,
  `// @mathpenny/utils/index.ts
export function greet(name: string) {
  return \`hello \${name}\`
}
`,
  `// @mathpenny/utils/greet.test.ts
import { test, expect } from 'bun:test'
import { greet } from './index'

test('greet', () => {
  expect(greet('mathpenny')).toMatchSnapshot()
})
`,
]

test('prepareTypescript scaffolds workspace packages with deps', async () => {
  const result = await prepareTypescript(INITIAL_CONTENTS, OPTS)
  expect(result).toMatchSnapshot()
})

test('manim package.json lists @mathpenny/utils as a workspace dependency', async () => {
  const manifestPath = join(PROJECT_DIR, 'packages', 'manim', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  expect(manifest.dependencies?.['@mathpenny/utils']).toBe('workspace:*')
})

test('prepareTypescript updates manifest when project exists and new file arrives', async () => {
  const newContents = [
    ...INITIAL_CONTENTS,
    `// @mathpenny/manim/format.ts
import chalk from 'chalk'

export function highlight(s: string) {
  return chalk.bold(s)
}
`,
  ]

  await prepareTypescript(newContents, OPTS)

  const manifestPath = join(PROJECT_DIR, 'packages', 'manim', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  expect(manifest.dependencies?.['chalk']).toBeTruthy()
  expect(manifest.dependencies?.['@mathpenny/utils']).toBe('workspace:*')
})
