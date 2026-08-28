import { describe, expect, mock, test } from 'bun:test'
import type { File, ScaffoldOptions } from './types'
import {createProject} from "./createProject"


const opts = {base: '/base'} as ScaffoldOptions

const paths = (files: File[] | undefined) => files?.map((f) => `${f.path}: ${f.content}`)

describe('createProject', () => {
  test('splits a blob into one file per path comment', async () => {
    const project = await createProject(
      [
        'here is the scaffold you asked for',
        '',
        '/* @acme/pkga/src/a.ts */',
        'export const a = 1',
        '',
        '/* @acme/pkgb/src/b.ts */',
        'export const b = 2',
      ].join('\n'),
      opts,
    )

    expect(project.units.flatMap((unit) => paths(unit.files))).toMatchInlineSnapshot(`
      [
        "/base/acme/packages/pkga/src/a.ts: export const a = 1",
        "/base/acme/packages/pkgb/src/b.ts: export const b = 2",
      ]
    `)
  })
})
