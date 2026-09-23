import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFilesFromTemplate } from '@paladin/utils'
import { finder, parseSnippet, resolveTiers } from './finder'

const SNIPPET = 'bring in the `inoremap` engine and the `qw` `ql` `qe` stuff to packages/codemirror'

let root: string
let paladin: string
let mathpen: string

const setMtime = (rel: string, secondsAgo: number) => {
  const t = new Date(Date.now() - secondsAgo * 1000)
  utimesSync(join(root, rel), t, t)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'finder-'))
  paladin = join(root, 'paladin')
  mathpen = join(root, 'mathpen')

  writeFilesFromTemplate(`
    /* paladin/packages/codemirror/src/index.ts */
    export {}

    /* paladin/packages/vim/src/inoremap.ts */
    export class inoremap {
      map(lhs: string, rhs: string) {}
    }

    /* paladin/packages/legacy/src/inoremap.ts */
    export function inoremap() {}

    /* paladin/packages/keys/src/quick.ts */
    export const quickWrite = () => 'w'
    export function quickLeave() {}

    /* paladin/packages/keys/src/maps.ts */
    import { quickWrite, quickLeave } from './quick'
    type Maps = {
      qw: string
    }
    export const maps = {
      qw: quickWrite,
      'ql': quickLeave,
      qe: () => 'e',
    }

    /* paladin/packages/keys/node_modules/junk/index.ts */
    export const qz = 1

    /* paladin/packages/vim/src/inoremap.test.ts */
    const inoremap = 'from a test'

    /* paladin/packages/vim/src/inoremap.demo.ts */
    export const qw = 'from a demo'

    /* paladin/packages/vim/examples/basic.ts */
    export function inoremap() {}

    /* paladin/packages/vim/tests/helpers.ts */
    export const onlyInTests = 1

    /* mathpen/packages/editor/src/inoremap.ts */
    export const inoremap = {}

    /* mathpen/packages/editor/src/mathonly.ts */
    export const mathonly = 1
  `, { root })

  // paladin/vim is newer than paladin/legacy, mathpen is newest of all but lives in the fallback tier
  setMtime('paladin/packages/legacy/src/inoremap.ts', 500)
  setMtime('paladin/packages/vim/src/inoremap.ts', 100)
  setMtime('mathpen/packages/editor/src/inoremap.ts', 1)
  // the test/demo/example copies are the newest in paladin but must be ignored
  setMtime('paladin/packages/vim/src/inoremap.test.ts', 0)
  setMtime('paladin/packages/vim/src/inoremap.demo.ts', 0)
  setMtime('paladin/packages/vim/examples/basic.ts', 0)
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('parseSnippet', () => {
  test('extracts backticked names and package refs', () => {
    expect(parseSnippet(SNIPPET)).toEqual({
      names: ['inoremap', 'qw', 'ql', 'qe'],
      packages: ['codemirror'],
    })
  })

  test('drops backticked package paths from names', () => {
    expect(parseSnippet('move `foo` into `packages/bar`').names).toEqual(['foo'])
  })
})

describe('resolveTiers', () => {
  test('the project owning the package is the startpoint', () => {
    expect(resolveTiers([mathpen, paladin], ['codemirror'])).toEqual({ start: [paladin], rest: [mathpen] })
  })
})

describe('finder', () => {
  const run = (snippet: string) => finder(snippet, { projects: [mathpen, paladin] })

  test('symbol: newest duplicate within the start project wins', async () => {
    const { start, hits } = await run(SNIPPET)
    expect(start).toEqual([paladin])
    const hit = hits.find(h => h.name === 'inoremap')!
    expect(hit.kind).toBe('symbol')
    expect(hit.file).toBe(join(paladin, 'packages/vim/src/inoremap.ts'))
  })

  test('field: resolves the value symbol to its defining file', async () => {
    const { hits } = await run(SNIPPET)
    const qw = hits.find(h => h.name === 'qw')!
    expect(qw).toMatchObject({
      kind: 'field',
      via: 'quickWrite',
      file: join(paladin, 'packages/keys/src/quick.ts'),
      fieldFile: join(paladin, 'packages/keys/src/maps.ts'),
    })
    const ql = hits.find(h => h.name === 'ql')!
    expect(ql).toMatchObject({ kind: 'field', via: 'quickLeave', file: join(paladin, 'packages/keys/src/quick.ts') })
  })

  test('field with an inline value points at the field file', async () => {
    const { hits } = await run(SNIPPET)
    const qe = hits.find(h => h.name === 'qe')!
    expect(qe.kind).toBe('field')
    expect(qe.via).toBeUndefined()
    expect(qe.file).toBe(join(paladin, 'packages/keys/src/maps.ts'))
  })

  test('falls back to other projects when the start project has nothing', async () => {
    const { hits } = await run('pull `mathonly` into packages/codemirror')
    expect(hits[0]).toMatchObject({ kind: 'symbol', file: join(mathpen, 'packages/editor/src/mathonly.ts') })
  })

  test('without a package ref every project is searched and newest wins', async () => {
    const { start, hits } = await run('grab `inoremap`')
    expect(start).toEqual([])
    expect(hits[0].file).toBe(join(mathpen, 'packages/editor/src/inoremap.ts'))
  })

  test('ignores test, demo and example files', async () => {
    const { hits } = await run('bring `inoremap` `qw` `onlyInTests` to packages/codemirror')
    expect(hits[0].file).toBe(join(paladin, 'packages/vim/src/inoremap.ts'))
    expect(hits[1]).toMatchObject({ kind: 'field', via: 'quickWrite' })
    expect(hits[2].kind).toBe('missing')
  })

  test('skips node_modules and reports missing names', async () => {
    const { hits } = await run('bring `qz` and `nope` to packages/codemirror')
    expect(hits.map(h => h.kind)).toEqual(['missing', 'missing'])
  })
})
