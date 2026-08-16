import { describe, expect, test } from 'bun:test'
import { TypescriptService } from '../index'
import { knip } from './knip'

describe('knip', () => {
  test('deletes files nothing reaches from an entry point', () => {
    const ts = TypescriptService.inMemory({
      '/src/index.ts': "import { used } from './used'\n\nexport const run = () => used()\n",
      '/src/used.ts': 'export const used = () => 1\n',
      '/src/orphan.ts': 'export const orphan = () => 2\n',
    })

    const summary = knip(ts)

    expect(summary.deletedFiles).toContain('/src/orphan.ts')
    expect(ts.exists('/src/used.ts')).toBe(true)
    expect(ts.exists('/src/orphan.ts')).toBe(false)
  })

  test('deletes exported symbols nobody references', () => {
    const ts = TypescriptService.inMemory({
      '/src/index.ts': "import { used } from './lib'\n\nexport const run = () => used()\n",
      '/src/lib.ts': 'export const used = () => 1\n\nexport const unused = () => 2\n',
    })

    const summary = knip(ts)

    expect(ts.text('/src/lib.ts')).toContain('used')
    expect(ts.text('/src/lib.ts')).not.toContain('unused')
    expect(summary.deletedSymbols.some(entry => entry.endsWith('#unused'))).toBe(true)
  })

  test('keeps exports of entry files', () => {
    const ts = TypescriptService.inMemory({
      '/src/index.ts': 'export const publicApi = () => 1\n',
    })

    knip(ts)

    expect(ts.text('/src/index.ts')).toContain('publicApi')
  })

  test('cascades across passes', () => {
    const ts = TypescriptService.inMemory({
      '/src/index.ts': "import { used } from './lib'\n\nexport const run = () => used()\n",
      '/src/lib.ts': [
        "import { deep } from './deep'",
        '',
        'export const used = () => 1',
        '',
        'export const unused = () => deep()',
        '',
      ].join('\n'),
      '/src/deep.ts': 'export const deep = () => 3\n',
    })

    const summary = knip(ts)

    expect(ts.text('/src/lib.ts')).not.toContain('unused')
    expect(ts.exists('/src/deep.ts')).toBe(false)
    expect(summary.passes).toBeGreaterThan(1)
  })

  test('leaves everything alone when nothing is unused', () => {
    const ts = TypescriptService.inMemory({
      '/src/index.ts': "import { used } from './lib'\n\nexport const run = () => used()\n",
      '/src/lib.ts': 'export const used = () => 1\n',
    })

    const summary = knip(ts)

    expect(summary.deletedFiles).toEqual([])
    expect(summary.deletedSymbols).toEqual([])
    expect(summary.passes).toBe(1)
  })
})
