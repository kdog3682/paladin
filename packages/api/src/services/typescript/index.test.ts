import { describe, expect, test } from 'bun:test'
import { TypescriptService } from './index'

const caseA = () =>
  TypescriptService.inMemory({
    '/src/dep.ts': 'export const a = 1\n',
    '/src/source.ts': [
      "import { a } from './dep'",
      '',
      'const b = 1',
      '',
      'export function abc() {',
      '  return a',
      '}',
      '',
      'export function def() {',
      '  return a + b',
      '}',
      '',
      'export function ghi() {',
      '  return b',
      '}',
      '',
    ].join('\n'),
    '/src/consumer.ts': [
      "import { abc, def, ghi } from './source'",
      '',
      'export const total = () => abc() + def() + ghi()',
      '',
    ].join('\n'),
  })

describe('renameSymbol', () => {
  test('renames the declaration and every consumer', () => {
    const ts = TypescriptService.inMemory({
      '/src/cobject.ts': 'export class Cgroup {}\n\nexport class Cobject {}\n',
      '/src/mobject.ts': "import { Cobject } from './cobject'\n\nexport class Mobject extends Cobject {}\n",
    })

    const result = ts.renameSymbol('Cobject', 'VMobject')

    expect(result.ok).toBe(true)
    expect(ts.text('/src/cobject.ts')).toContain('export class VMobject')
    expect(ts.text('/src/mobject.ts')).toContain('import { VMobject }')
    expect(ts.text('/src/mobject.ts')).toContain('extends VMobject')
    expect(result.changedFiles).toContain('/src/mobject.ts')
  })

  test('scopes by file when the ref is qualified', () => {
    const ts = TypescriptService.inMemory({
      '/src/one.ts': 'export const shared = 1\n',
      '/src/two.ts': 'export const shared = 2\n',
    })

    ts.renameSymbol('/src/two.ts#shared', 'other')

    expect(ts.text('/src/one.ts')).toContain('shared')
    expect(ts.text('/src/two.ts')).toContain('export const other')
  })
})

describe('renameFile', () => {
  test('accepts a relative path and rewrites importers', () => {
    const ts = TypescriptService.inMemory({
      '/src/cobject.ts': 'export class VMobject {}\n',
      '/src/mobject.ts': "import { VMobject } from './cobject'\n\nexport class Mobject extends VMobject {}\n",
      '/src/index.ts': "import { Mobject } from './mobject'\n\nexport const make = () => new Mobject()\n",
    })

    const result = ts.renameFile('src/mobject.ts', './core/mobject.ts')

    expect(result.ok).toBe(true)
    expect(result.createdFiles).toEqual(['/src/core/mobject.ts'])
    expect(result.deletedFiles).toEqual(['/src/mobject.ts'])
    expect(ts.text('/src/index.ts')).toContain("from './core/mobject'")
    expect(ts.text('/src/core/mobject.ts')).toContain("from '../cobject'")
  })

  test('walks up with ../', () => {
    const ts = TypescriptService.inMemory({
      '/src/core/thing.ts': 'export const thing = 1\n',
      '/src/index.ts': "import { thing } from './core/thing'\n\nexport const used = thing\n",
    })

    ts.renameFile('/src/core/thing.ts', '../thing.ts')

    expect(ts.exists('/src/thing.ts')).toBe(true)
    expect(ts.text('/src/index.ts')).toContain("from './thing'")
  })

  test('fails when the target already exists', () => {
    const ts = TypescriptService.inMemory({
      '/src/a.ts': 'export const a = 1\n',
      '/src/b.ts': 'export const b = 1\n',
    })

    const result = ts.renameFile('/src/a.ts', './b.ts')

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('already exists')
  })
})

describe('moveSymbol', () => {
  test('takes its import dependency along', () => {
    const ts = caseA()

    const result = ts.moveSymbol('abc', './target.ts')

    expect(result.ok).toBe(true)
    const target = ts.text('/src/target.ts')
    expect(target).toContain('export function abc')
    expect(target).toContain("import { a } from './dep'")
    expect(ts.text('/src/source.ts')).not.toContain('function abc')
    expect(ts.text('/src/consumer.ts')).toContain("from './target'")
    expect(ts.text('/src/consumer.ts')).toContain("from './source'")
  })

  test('leaves a shared dependency behind and imports it instead', () => {
    const ts = caseA()

    const result = ts.moveSymbol('def', './target.ts')

    expect(result.ok).toBe(true)
    const source = ts.text('/src/source.ts')
    const target = ts.text('/src/target.ts')
    expect(source).toContain('export const b = 1')
    expect(source).not.toContain('function def')
    expect(target).toContain('export function def')
    expect(target).toContain("import { b } from './source'")
    expect(target).toContain("import { a } from './dep'")
  })

  test('drags a private dependency along when nothing else uses it', () => {
    const ts = TypescriptService.inMemory({
      '/src/source.ts': [
        'const only = 2',
        '',
        'export function ghi() {',
        '  return only',
        '}',
        '',
        'export function unrelated() {',
        '  return 1',
        '}',
        '',
      ].join('\n'),
      '/src/consumer.ts': "import { ghi } from './source'\n\nexport const run = () => ghi()\n",
    })

    ts.moveSymbol('ghi', './target.ts')

    expect(ts.text('/src/source.ts')).not.toContain('const only')
    expect(ts.text('/src/target.ts')).toContain('const only = 2')
    expect(ts.text('/src/target.ts')).toContain('export function ghi')
    expect(ts.text('/src/consumer.ts')).toContain("import { ghi } from './target'")
  })

  test('moving into a file that imported the symbol drops the import', () => {
    const ts = TypescriptService.inMemory({
      '/src/helper.ts': 'export const helper = () => 1\n',
      '/src/app.ts': "import { helper } from './helper'\n\nexport const app = () => helper()\n",
    })

    ts.moveSymbol('helper', '/src/app.ts')

    const app = ts.text('/src/app.ts')
    expect(app).toContain('const helper = () => 1')
    expect(app).not.toContain("from './helper'")
  })

  test('reports a missing symbol', () => {
    const ts = TypescriptService.inMemory({ '/src/a.ts': 'export const a = 1\n' })

    const result = ts.moveSymbol('nope', './b.ts')

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('symbol not found')
  })
})

describe('deleteSymbol', () => {
  test('removes the declaration and prunes consumer imports', () => {
    const ts = TypescriptService.inMemory({
      '/src/source.ts': 'export const keep = 1\n\nexport const drop = 2\n',
      '/src/consumer.ts': "import { drop, keep } from './source'\n\nexport const used = keep\n",
    })

    const result = ts.deleteSymbol('drop')

    expect(result.ok).toBe(true)
    expect(ts.text('/src/source.ts')).not.toContain('drop')
    expect(ts.text('/src/consumer.ts')).toContain('import { keep }')
    expect(ts.text('/src/consumer.ts')).not.toContain('drop')
    
  })

  test('drops imports that only the deleted symbol used', () => {
    const ts = TypescriptService.inMemory({
      '/src/dep.ts': 'export const a = 1\n',
      '/src/source.ts': "import { a } from './dep'\n\nexport const uses = () => a\n",
    })

    ts.deleteSymbol('uses')

    expect(ts.text('/src/source.ts')).not.toContain("from './dep'")
  })

  test('warns about references it cannot rewrite', () => {
    const ts = TypescriptService.inMemory({
      '/src/source.ts': 'export const a = 1\n\nexport const b = () => a\n',
    })

    const result = ts.deleteSymbol('a')

    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain('dangling reference')
  })
})

describe('the cobject scenario', () => {
  test('renames both classes and relocates mobject', () => {
    const ts = TypescriptService.inMemory({
      '/src/cobject.ts': 'export class Cgroup {}\n\nexport class Cobject {}\n',
      '/src/mobject.ts': [
        "import { Cgroup, Cobject } from './cobject'",
        '',
        'export class Mobject extends Cobject {}',
        '',
        'export const group = () => new Cgroup()',
        '',
      ].join('\n'),
      '/src/index.ts': [
        "import { Cgroup } from './cobject'",
        "import { Mobject } from './mobject'",
        '',
        'export const build = () => [new Cgroup(), new Mobject()]',
        '',
      ].join('\n'),
    })

    expect(ts.renameSymbol('Cgroup', 'Vgroup').ok).toBe(true)
    expect(ts.renameSymbol('Cobject', 'VMobject').ok).toBe(true)
    expect(ts.renameFile('src/mobject.ts', './core/mobject.ts').ok).toBe(true)

    const moved = ts.text('/src/core/mobject.ts')
    expect(moved).toContain("import { Vgroup, VMobject } from '../cobject'")
    expect(moved).toContain('extends VMobject')
    expect(ts.text('/src/index.ts')).toContain("from './core/mobject'")
    expect(ts.text('/src/index.ts')).toContain('new Vgroup()')
  })
})
