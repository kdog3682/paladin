import { beforeEach, expect, mock, test } from 'bun:test'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ScaffoldOptions } from '../types'
import { createProject } from '../createProject'
import { resolveDependencies } from './resolveDependencies'

const NPM_CACHE_PATH = join(mkdtempSync(join(tmpdir(), 'paladin-cache-')), 'npm-dependencies.json')
const utils = await import('@paladin/utils')

const installs: { argv: string[]; cwd?: string }[] = []
const fetched: string[] = []

mock.module('@paladin/utils', () => ({
  ...utils,
  bash: async (argv: string[], opts?: { cwd?: string }) => {
    installs.push({ argv, cwd: opts?.cwd })
    return { stdout: '', stderr: '', exitCode: 0 }
  },
}))

globalThis.fetch = (async (url: string | URL) => {
  fetched.push(String(url))
  return new Response(JSON.stringify({ version: '1.2.3' }))
}) as unknown as typeof fetch

const base = () => mkdtempSync(join(tmpdir(), 'paladin-base-'))

const opts = (root: string) =>
  ({ base: root, npmCachePath: NPM_CACHE_PATH }) as ScaffoldOptions

const manifestAt = (dir: string) => Bun.file(join(dir, 'package.json')).json()

beforeEach(() => {
  installs.length = 0
  fetched.length = 0
})

test('classifies each import by where it actually lives', async () => {
  const root = base()
  mkdirSync(join(root, 'paladin'))

  const project = await createProject(
    `
/* @mathpen/manim/src/index.ts */
import { collectImports } from '@paladin/utils/collectImports'
import { render } from '@mathpen/core'
import { self } from '@mathpen/manim'
import { z } from 'zod'
import fp from 'lodash/fp'
import { join } from 'path'
import { readFile } from 'node:fs/promises'
import { local } from './local'

/* @mathpen/manim/src/legacy.js */
import $ from 'jquery'

/* @mathpen/manim/package.json */
{ "name": "@mathpen/manim" }
`,
    opts(root),
  )

  await resolveDependencies(project, opts(root))

  const dir = join(root, 'mathpen', 'packages', 'manim')
  expect((await manifestAt(dir)).dependencies).toEqual({
    '@paladin/utils': 'file:../../../paladin/packages/utils',
    '@mathpen/core': 'workspace:*',
    zod: '^1.2.3',
    lodash: '^1.2.3',
  })
  expect(fetched).toHaveLength(2)
})

test('a scope with no project under base is a registry package', async () => {
  const root = base()

  const project = await createProject(
    `
/* @mathpen/plot/src/index.ts */
import { render } from '@paladin/utils'

/* @mathpen/plot/package.json */
{ "name": "@mathpen/plot" }
`,
    opts(root),
  )

  await resolveDependencies(project, opts(root))

  const dir = join(root, 'mathpen', 'packages', 'plot')
  expect((await manifestAt(dir)).dependencies).toEqual({ '@paladin/utils': '^1.2.3' })
})

test('imports from test files land in devDependencies', async () => {
  const root = base()

  const project = await createProject(
    `
/* @app/ui/src/button.tsx */
import { useState } from 'react'

/* @app/ui/src/button.test.ts */
import { render } from 'happy-dom'

/* @app/ui/test/setup.ts */
import { matchers } from 'jest-extended'

/* @app/ui/package.json */
{ "name": "@app/ui" }
`,
    opts(root),
  )

  await resolveDependencies(project, opts(root))

  const manifest = await manifestAt(join(root, 'app', 'packages', 'ui'))
  expect(manifest.dependencies).toEqual({ react: '^1.2.3' })
  expect(manifest.devDependencies).toEqual({
    'happy-dom': '^1.2.3',
    'jest-extended': '^1.2.3',
  })
})

test('leaves already declared deps alone and skips the install', async () => {
  const root = base()

  const project = await createProject(
    `
/* @app/core/src/index.ts */
import dayjs from 'dayjs'

/* @app/core/package.json */
{ "name": "@app/core", "dependencies": { "dayjs": "^0.9.0" } }
`,
    opts(root),
  )

  const ran = await resolveDependencies(project, opts(root))

  expect(ran).toBe(false)
  expect(installs).toEqual([])
  expect(fetched).toEqual([])
  expect((await manifestAt(join(root, 'app', 'packages', 'core'))).dependencies).toEqual({
    dayjs: '^0.9.0',
  })
})

test('installs whenever a manifest changed, even on a version cache hit', async () => {
  const root = base()

  const template = (name: string) => `
/* @app/${name}/src/index.ts */
import { nanoid } from 'nanoid'

/* @app/${name}/package.json */
{ "name": "@app/${name}" }
`

  const first = await createProject(template('first'), opts(root))
  await resolveDependencies(first, opts(root))
  expect(installs).toEqual([{ argv: ['bun', 'install'], cwd: join(root, 'app') }])
  expect(fetched).toHaveLength(1)

  installs.length = 0
  fetched.length = 0

  const second = await createProject(template('second'), opts(root))
  const ran = await resolveDependencies(second, opts(root))

  expect(ran).toBe(true)
  expect(installs).toHaveLength(1)
  expect(fetched).toEqual([])
})
