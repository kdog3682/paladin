import { test, expect } from 'bun:test'
import { prepare } from './prepare'

test('prepare snapshot', () => {
  const opts = {
    baseProjectDir: '~/projects',
    activeDir: '~/projects/paladin',
  }

  const contents = [
    // package file (web -> components injected)
    `// @paladin/web/Foobar/useFoo.ts\nexport const useFoo = () => {}\n`,
    // package file (packages/ prefixed form)
    `// @paladin/packages/core/index.ts\nexport const core = true\n`,
    // top-level project file, no package
    `// paladin/README.md\n# readme\n`,
    // no valid header, should be skipped
    `no header here\n`,
    // deprecated, should be skipped
    `// deprecated old file\n// @paladin/web/old.ts\nexport {}\n`,
  ]

  const result = prepare(contents, opts as any)

  expect(result).toMatchSnapshot()
})
