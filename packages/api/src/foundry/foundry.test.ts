// Hermetic: temp dirs + injected result store, no network/install.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { hashContent } from './hash'
import { classifyKind } from './classify'
import { parsePath, fileDisplayName, packageDisplayName, projectDisplayName, workspaceSpec } from './paths'
import { reconcile, type Baseline } from './reconcile'
import { collectImports, resolveLocal } from './imports'
import { ClosureResolver } from './closure'
import { buildProject } from './nodes'
import { RunStore, type Executor } from './runner'
import type { CodeExecutionResult, FileNodeInternal } from './types'

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function node(over: Partial<FileNodeInternal> & Pick<FileNodeInternal, 'path' | 'contentHash'>): FileNodeInternal {
  return {
    displayName: 'x',
    kind: 'source',
    isNew: false,
    git: { status: 'clean', staged: false },
    modifiedAt: 0,
    ...over,
  }
}

describe('hash', () => {
  it('is deterministic and change-sensitive', () => {
    expect(hashContent('a')).toBe(hashContent('a'))
    expect(hashContent('a')).not.toBe(hashContent('b'))
  })
})

describe('classifyKind', () => {
  it('reads dir first, suffix as fallback', () => {
    expect(classifyKind('/p/packages/m/tests/a.ts')).toBe('test')
    expect(classifyKind('/p/packages/m/src/a.test.ts')).toBe('test')
    expect(classifyKind('/p/packages/m/demos/a.ts')).toBe('demo')
    expect(classifyKind('/p/packages/m/scripts/a.ts')).toBe('script')
    expect(classifyKind('/p/packages/m/package.json')).toBe('config')
    expect(classifyKind('/p/packages/m/vite.config.ts')).toBe('config')
    expect(classifyKind('/p/packages/m/src/a.ts')).toBe('source')
  })
})

describe('paths', () => {
  const base = '/home/u/projects'
  it('parses package and root files', () => {
    expect(parsePath(`${base}/mathpen/packages/manim/src/scene.ts`, base)).toEqual({
      projectName: 'mathpen',
      pkgName: 'manim',
      relpath: 'src/scene.ts',
    })
    expect(parsePath(`${base}/mathpen/foo.ts`, base)).toEqual({
      projectName: 'mathpen',
      pkgName: null,
      relpath: 'foo.ts',
    })
  })
  it('derives display names', () => {
    expect(fileDisplayName(`${base}/mathpen/packages/manim/src/scene.ts`, base)).toBe('src/scene.ts')
    expect(packageDisplayName('mathpen', 'manim')).toBe('mathpen/manim')
    expect(projectDisplayName('mathpen')).toBe('@projects/mathpen')
    expect(workspaceSpec('mathpen', 'manim')).toBe('@mathpen/manim')
  })
})

describe('reconcile', () => {
  it('diffs nodes against the baseline', () => {
    const baseline: Baseline = { hashes: { '/a': 'h1', '/b': 'h2' }, staged: ['/b'] }
    const nodes = [
      node({ path: '/a', contentHash: 'h1' }), // unchanged
      node({ path: '/b', contentHash: 'zz' }), // changed + staged
      node({ path: '/c', contentHash: 'h3' }), // new to foundry
    ]
    reconcile(nodes, baseline)
    expect(nodes[0].git).toEqual({ status: 'clean', staged: false })
    expect(nodes[1].git).toEqual({ status: 'modified', staged: true })
    expect(nodes[2].git).toEqual({ status: 'created', staged: false })
  })
})

describe('imports', () => {
  it('collects external roots, drops relative + builtins', async () => {
    const src = `import _ from 'lodash/fp'\nimport {x} from './local'\nimport fs from 'node:fs'\nimport {j} from '@scope/pkg/sub'`
    expect((await collectImports(src)).sort()).toEqual(['@scope/pkg', 'lodash'])
  })
})

describe('closure', () => {
  let base: string
  let demo: string
  let dep: string

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'foundry-clo-'))
    dep = join(base, 'proj/packages/manim/src/index.ts')
    demo = join(base, 'proj/packages/manim/demos/run.ts')
    write(dep, `export const answer = 42\n`)
    write(demo, `import {answer} from '@proj/manim'\nimport _ from 'lodash'\nconsole.log(answer)\n`)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('resolves relative + workspace imports to local files', () => {
    expect(resolveLocal('@proj/manim', demo, base)).toBe(dep)
    expect(resolveLocal('lodash', demo, base)).toBeNull()
    expect(resolveLocal('node:fs', demo, base)).toBeNull()
  })

  it('key is stable, moves on local dep change, ignores externals via key', async () => {
    const k1 = await new ClosureResolver(base, 'ext-a').cacheKey(demo)
    const k2 = await new ClosureResolver(base, 'ext-a').cacheKey(demo)
    expect(k1).toBe(k2) // deterministic

    const kExt = await new ClosureResolver(base, 'ext-b').cacheKey(demo)
    expect(kExt).not.toBe(k1) // external dep set changed

    write(dep, `export const answer = 43\n`) // deep edit in a local dep
    const k3 = await new ClosureResolver(base, 'ext-a').cacheKey(demo)
    expect(k3).not.toBe(k1)
  })
})

describe('buildProject', () => {
  let base: string
  let dir: string

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'foundry-bp-'))
    dir = join(base, 'proj/packages/manim')
    write(join(dir, 'package.json'), JSON.stringify({ name: '@proj/manim', dependencies: { lodash: '^4.17.0' } }))
    write(join(dir, 'src/scene.ts'), `export const x = 1\n`)
    write(join(dir, 'demos/run.ts'), `import {x} from '../src/scene'\nconsole.log(x)\n`)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('builds classified, reconciled nodes with keys on runnables only', async () => {
    const files = [
      { path: join(dir, 'src/scene.ts'), content: `export const x = 1\n`, isNew: true },
      { path: join(dir, 'demos/run.ts'), content: `import {x} from '../src/scene'\nconsole.log(x)\n`, isNew: true },
    ]
    const nodes = await buildProject([{ dir, files }], base, { hashes: {}, staged: [] })
    const byName = Object.fromEntries(nodes.map((n) => [n.displayName, n]))

    expect(byName['src/scene.ts'].kind).toBe('source')
    expect(byName['src/scene.ts'].cacheKey).toBeUndefined()
    expect(byName['demos/run.ts'].kind).toBe('demo')
    expect(byName['demos/run.ts'].cacheKey).toBeString()
    expect(byName['demos/run.ts'].git.status).toBe('created') // empty baseline
  })
})

describe('RunStore', () => {
  let base: string
  let store: RunStore
  let calls = 0

  // Fake executor: no runtime spawned. Returns an incrementing marker so cache
  // hits vs re-executions are distinguishable, plus an image output to check
  // URL versioning.
  const fake: Executor = async (args): Promise<CodeExecutionResult> => ({
    exitCode: 0,
    stdout: `run-${++calls}`,
    stderr: '',
    args,
    output: { type: 'image', url: 'https://cdn.example/x.png' },
  })

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'foundry-run-'))
    store = new RunStore('test-proj', join(base, 'results'), fake)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('executes, caches, force-reruns, versions output, round-trips', async () => {
    const demo = node({
      path: '/p/demos/hello.ts',
      contentHash: 'h',
      kind: 'demo',
      displayName: 'demos/hello.ts',
      cacheKey: 'ck-1',
    })

    const first = await store.run(demo, '/p')
    expect(first.stdout).toBe('run-1')
    expect(first.output).toEqual({ type: 'image', url: 'https://cdn.example/x.png?v=ck-1' })
    expect(store.hasResult(demo)).toBe(true)

    const cached = await store.run(demo, '/p')
    expect(cached.stdout).toBe('run-1') // cache hit, not re-executed

    const forced = await store.run(demo, '/p', { force: true })
    expect(forced.stdout).toBe('run-2') // re-executed

    await store.save()
    const reloaded = new RunStore('test-proj', join(base, 'results'), fake)
    await reloaded.load()
    expect(reloaded.get('ck-1')?.stdout).toBe('run-2')
  })
})
