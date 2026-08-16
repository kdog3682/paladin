import { describe, expect, test } from 'bun:test'
import { TypescriptService } from '../index'
import { consolidateSmallFiles } from './consolidateSmallFiles'

describe('consolidateSmallFiles', () => {
  test('folds a tiny single-consumer file into its consumer', () => {
    const ts = TypescriptService.inMemory({
      '/src/app.ts': [
        "import { format } from './format'",
        '',
        'export const render = (value: string) => format(value)',
        '',
      ].join('\n'),
      '/src/format.ts': 'export const format = (value: string) => value.trim()\n',
    })

    const summary = consolidateSmallFiles(ts)

    const app = ts.text('/src/app.ts')
    expect(app).toContain('const format = (value: string) => value.trim()')
    expect(app).not.toContain("from './format'")
    expect(app).not.toContain('export const format')
    expect(ts.exists('/src/format.ts')).toBe(false)
    expect(summary.merged).toEqual([{ from: '/src/format.ts', into: '/src/app.ts', symbols: ['format'] }])
  })

  test('skips files with two or more importers', () => {
    const ts = TypescriptService.inMemory({
      '/src/a.ts': "import { shared } from './shared'\n\nexport const a = () => shared()\n",
      '/src/b.ts': "import { shared } from './shared'\n\nexport const b = () => shared()\n",
      '/src/shared.ts': 'export const shared = () => 1\n',
    })

    const summary = consolidateSmallFiles(ts)

    expect(ts.exists('/src/shared.ts')).toBe(true)
    expect(summary.merged).toEqual([])
    expect(summary.skipped.some(entry => entry.file === '/src/shared.ts')).toBe(true)
  })

  test('skips files with three or more functions', () => {
    const ts = TypescriptService.inMemory({
      '/src/app.ts': "import { one } from './many'\n\nexport const app = () => one()\n",
      '/src/many.ts': [
        'export const one = () => 1',
        'export const two = () => 2',
        'export const three = () => 3',
        '',
      ].join('\n'),
    })

    consolidateSmallFiles(ts)

    expect(ts.exists('/src/many.ts')).toBe(true)
  })

  test('skips files longer than the line budget', () => {
    const filler = Array.from({ length: 70 }, (_, index) => `// note ${index}`).join('\n')
    const ts = TypescriptService.inMemory({
      '/src/app.ts': "import { big } from './big'\n\nexport const app = () => big()\n",
      '/src/big.ts': `${filler}\nexport const big = () => 1\n`,
    })

    const summary = consolidateSmallFiles(ts)

    expect(ts.exists('/src/big.ts')).toBe(true)
    expect(summary.skipped.some(entry => entry.reason.includes('lines'))).toBe(true)
  })

  test('carries the folded file own imports across', () => {
    const ts = TypescriptService.inMemory({
      '/src/app.ts': "import { format } from './format'\n\nexport const render = () => format('x')\n",
      '/src/format.ts': [
        "import { trim } from './trim'",
        '',
        'export const format = (value: string) => trim(value)',
        '',
      ].join('\n'),
      '/src/trim.ts': [
        'export const trim = (value: string) => value.trim()',
        'export const upper = (value: string) => value.toUpperCase()',
        'export const lower = (value: string) => value.toLowerCase()',
        '',
      ].join('\n'),
    })

    consolidateSmallFiles(ts)

    const app = ts.text('/src/app.ts')
    expect(app).toContain("import { trim } from './trim'")
    expect(app).toContain('const format = (value: string) => trim(value)')
  })

  test('never touches entry points', () => {
    const ts = TypescriptService.inMemory({
      '/src/app.ts': "import { boot } from './index'\n\nexport const app = () => boot()\n",
      '/src/index.ts': 'export const boot = () => 1\n',
    })

    consolidateSmallFiles(ts)

    expect(ts.exists('/src/index.ts')).toBe(true)
    expect(ts.text('/src/index.ts')).toContain('export const boot')
  })
})
