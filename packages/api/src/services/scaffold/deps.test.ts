import { test, expect } from 'bun:test'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DependencyResolver } from './deps'
import type { FileEntry } from './types'

test('subpath imports under the project scope resolve to workspace:*', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-'))
  const resolver = new DependencyResolver('paladin', join(dir, 'npm-cache.json'))

  const resolved = await resolver.resolve({
    name: 'cme',
    dir,
    isNew: true,
    files: [
      {
        path: 'src/App.tsx',
        content: [
          "import { createApiClient } from '@paladin/utils/api'",
          "import { basicSetup } from './extension'",
        ].join('\n'),
      },
    ] as unknown as FileEntry[],
  })

  // @paladin/utils is a sibling workspace package, not an npm lookup.
  expect(resolved?.deps).toEqual({ '@paladin/utils': 'workspace:*' })
  expect(resolved?.devDeps).toEqual({})
})
