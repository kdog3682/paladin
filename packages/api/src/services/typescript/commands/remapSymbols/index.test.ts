import { describe, expect, test } from 'bun:test'
import { TypescriptService } from '../..'
import { remapSymbols } from './index'

const vmobject = `export class Vobject {
  id = 'v'
}

export class VMGroup {
  constructor(public members: Vobject[]) {}
}
`

const cobject = `export class Cobject {
  id = 'c'
}

export class CGroup {
  constructor(public members: Cobject[]) {}
}
`

const symbols = { Cobject: 'Vobject', CGroup: 'VMGroup' }

const build = (files: Record<string, string>) =>
  TypescriptService.inMemory({ 'vmobject.ts': vmobject, 'cobject.ts': cobject, ...files }, '/src')

const run = (service: TypescriptService, deleteSource?: boolean) =>
  remapSymbols(service, { from: 'cobject.ts', to: 'vmobject.ts', symbols, deleteSource })

const namedImports = (text: string, module: string) => {
  const escaped = module.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const pattern = new RegExp(`import(?: type)? \\{([^}]*)\\} from '${escaped}'`, 'g')
  return [...text.matchAll(pattern)].flatMap(match =>
    match[1]
      .split(',')
      .map(part => part.trim().replace(/^type /, ''))
      .filter(Boolean),
  )
}

const declarationCount = (text: string, module: string) => {
  const escaped = module.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return [...text.matchAll(new RegExp(`from '${escaped}'`, 'g'))].length
}

describe('remapSymbols', () => {
  test('rewrites imports and usages, then deletes the source module', () => {
    const service = build({
      'scene.ts': `import { CGroup, Cobject } from './cobject'

export const build = () => {
  const item = new Cobject()
  return new CGroup([item])
}
`,
    })

    const result = run(service)
    const text = service.text('scene.ts')

    expect(namedImports(text, './vmobject').sort()).toEqual(['VMGroup', 'Vobject'])
    expect(text).toContain('new Vobject()')
    expect(text).toContain('new VMGroup([item])')
    expect(text).not.toContain('Cobject')
    expect(text).not.toContain('CGroup')
    expect(text).not.toContain('./cobject')
    expect(result.changedFiles).toContain('/src/scene.ts')
    expect(result.deletedFiles).toContain('/src/cobject.ts')
    expect(service.exists('cobject.ts')).toBe(false)
  })

  test('rewrites type positions as well as value positions', () => {
    const service = build({
      'shapes.ts': `import { Cobject } from './cobject'

export const wrap = (item: Cobject): Cobject[] => [item]

export type Holder = { child: Cobject }
`,
    })

    run(service)
    const text = service.text('shapes.ts')

    expect(text).toContain('(item: Vobject): Vobject[]')
    expect(text).toContain('child: Vobject')
    expect(text).not.toContain('Cobject')
  })

  test('keeps the local name when the import was aliased', () => {
    const service = build({
      'aliased.ts': `import { Cobject as Base } from './cobject'

export const make = () => new Base()
`,
    })

    run(service)
    const text = service.text('aliased.ts')

    expect(text).toContain("from './vmobject'")
    expect(text).toContain('Vobject as Base')
    expect(text).toContain('new Base()')
  })

  test('preserves type-only imports', () => {
    const service = build({
      'types.ts': `import type { Cobject } from './cobject'

export const first = (items: Cobject[]) => items[0]
`,
    })

    run(service)
    const text = service.text('types.ts')

    expect(text).toMatch(/import (?:type )?\{\s*(?:type )?Vobject\s*\} from '\.\/vmobject'/)
    expect(text).toContain('items: Vobject[]')
  })

  test('merges into an existing import of the target module', () => {
    const service = build({
      'merge.ts': `import { Vobject } from './vmobject'
import { CGroup } from './cobject'

export const group = (item: Vobject) => new CGroup([item])
`,
    })

    run(service)
    const text = service.text('merge.ts')

    expect(declarationCount(text, './vmobject')).toBe(1)
    expect(namedImports(text, './vmobject').sort()).toEqual(['VMGroup', 'Vobject'])
    expect(text).toContain('new VMGroup([item])')
  })

  test('rewrites relative specifiers from nested directories', () => {
    const service = build({
      'nested/deep/scene.ts': `import { Cobject } from '../../cobject'

export const make = () => new Cobject()
`,
    })

    run(service)
    const text = service.text('nested/deep/scene.ts')

    expect(text).toContain("from '../../vmobject'")
    expect(text).toContain('new Vobject()')
  })

  test('repoints barrel re-exports and keeps the public name', () => {
    const service = build({
      'index.ts': `export { CGroup, Cobject } from './cobject'
`,
    })

    const result = run(service)
    const text = service.text('index.ts')

    expect(text).toContain("from './vmobject'")
    expect(text).not.toContain('./cobject')
    expect(text).toContain('Vobject as Cobject')
    expect(text).toContain('VMGroup as CGroup')
    expect(result.warnings.some(warning => warning.includes('under the name Cobject'))).toBe(true)
  })

  test('rewrites shorthand property usages', () => {
    const service = build({
      'shorthand.ts': `import { Cobject } from './cobject'

export const registry = { Cobject }
`,
    })

    run(service)
    const text = service.text('shorthand.ts')

    expect(text).toContain('{ Cobject: Vobject }')
  })

  test('warns about symbols with no replacement', () => {
    const service = build({
      'cobject.ts': `${cobject}
export const CDEFAULTS = { scale: 1 }
`,
      'settings.ts': `import { CDEFAULTS, Cobject } from './cobject'

export const make = () => ({ item: new Cobject(), defaults: CDEFAULTS })
`,
    })

    const result = run(service)
    const text = service.text('settings.ts')

    expect(result.warnings.some(warning => warning.includes('CDEFAULTS'))).toBe(true)
    expect(text).toContain('new Vobject()')
    expect(text).toContain('CDEFAULTS')
  })

  test('warns when a consumer already binds the incoming name', () => {
    const service = build({
      'other.ts': `export class Vobject {
  id = 'other'
}
`,
      'clash.ts': `import { Vobject } from './other'
import { Cobject } from './cobject'

export const pair = () => [new Vobject(), new Cobject()]
`,
    })

    const result = run(service)

    expect(result.warnings.some(warning => warning.includes('already binds Vobject'))).toBe(true)
  })

  test('leaves the source module in place when deleteSource is false', () => {
    const service = build({
      'scene.ts': `import { Cobject } from './cobject'

export const make = () => new Cobject()
`,
    })

    const result = run(service, false)

    expect(service.exists('cobject.ts')).toBe(true)
    expect(result.deletedFiles).toHaveLength(0)
    expect(service.text('scene.ts')).toContain('new Vobject()')
  })

  test('leaves the project untouched when a module is missing', () => {
    const service = build({
      'scene.ts': `import { Cobject } from './cobject'

export const make = () => new Cobject()
`,
    })

    remapSymbols(service, { from: 'cobject.ts', to: 'missing.ts', symbols })

    expect(service.exists('cobject.ts')).toBe(true)
    expect(service.text('scene.ts')).toContain('new Cobject()')
    expect(service.text('scene.ts')).toContain("from './cobject'")
  })

  test('reports nothing to do when no file imports the source', () => {
    const service = build({
      'scene.ts': `import { Vobject } from './vmobject'

export const make = () => new Vobject()
`,
    })

    const result = run(service)

    expect(result.changedFiles).toHaveLength(0)
    expect(result.deletedFiles).toContain('/src/cobject.ts')
    expect(service.text('scene.ts')).toContain('new Vobject()')
  })
})
