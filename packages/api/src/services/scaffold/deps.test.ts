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

// Reproduces: "scaffold: no version found for "${tmpl}"" — a file whose import
// source is a literal, unsubstituted template placeholder (e.g. an author file
// still containing `import x from '${tmpl}'`) gets treated as a real npm
// package name and sent to the registry, which of course has no such package.
test('an unresolved template placeholder used as an import source fails version lookup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-'))
  const resolver = new DependencyResolver('paladin', join(dir, 'npm-cache.json'))

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({}), { status: 404 })) as typeof fetch

  try {
    const badFile = {
      path: 'src/App.tsx',
      content: "import x from '${tmpl}'",
    } as unknown as FileEntry

    await expect(
      resolver.resolve({ name: 'cme', dir, isNew: true, files: [badFile] }),
    ).rejects.toThrow('scaffold: no version found for "${tmpl}"')
  } finally {
    globalThis.fetch = originalFetch
  }
})
