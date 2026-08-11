import { afterAll, beforeAll, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectFiles, getMostRecentFile } from './fs'

const DAY = 86_400_000
const T0 = Date.UTC(2024, 0, 1)
const at = (offsetDays: number) => new Date(T0 + offsetDays * DAY)

let dir: string

const write = (rel: string, offsetDays: number) => {
    const filepath = path.join(dir, rel)
    fs.mkdirSync(path.dirname(filepath), { recursive: true })
    fs.writeFileSync(filepath, rel)
    const secs = (T0 + offsetDays * DAY) / 1000
    fs.utimesSync(filepath, secs, secs)
}

// walk order is not guaranteed, so compare sorted basenames
const names = (files: string[]) => files.map((f) => path.basename(f)).sort()

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collect-files-'))
    write('old.zip', 0)
    write('nested/deep.zip', 2)
    write('notes.md', 5)
    write('new.zip', 10)
    write('abc/foobar/thing.ts', 12)
    write('node_modules/junk.zip', 20)
    write('new (2).zip', 30)
})

afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
})

test('walks recursively, ignoring node_modules by default', () => {
    expect(names(collectFiles(dir))).toEqual([
        'deep.zip',
        'new (2).zip',
        'new.zip',
        'notes.md',
        'old.zip',
        'thing.ts',
    ])
})

test('include.exts', () => {
    expect(names(collectFiles(dir, { include: { exts: ['.ZIP'] } }))).toEqual([
        'deep.zip',
        'new (2).zip',
        'new.zip',
        'old.zip',
    ])
})

test('recursive: false stays top level', () => {
    expect(names(collectFiles(dir, { recursive: false }))).toEqual(['new (2).zip', 'new.zip', 'notes.md', 'old.zip'])
})

test('exclude wins over include', () => {
    expect(collectFiles(dir, { include: { exts: ['zip'] }, exclude: { exts: ['zip'] } })).toEqual([])
    expect(names(collectFiles(dir, { include: { exts: ['zip'] }, exclude: { names: ['old', 'deep'] } }))).toEqual([
        'new (2).zip',
        'new.zip',
    ])
})

test('include.parts matches a path substring', () => {
    expect(names(collectFiles(dir, { include: { parts: ['abc/foobar'] } }))).toEqual(['thing.ts'])
    expect(names(collectFiles(dir, { exclude: { parts: ['abc/foobar', 'nested/'] } }))).toEqual([
        'new (2).zip',
        'new.zip',
        'notes.md',
        'old.zip',
    ])
})

test('ignoreDirs is overridable', () => {
    expect(names(collectFiles(dir, { include: { exts: ['zip'] }, ignoreDirs: [] }))).toEqual([
        'deep.zip',
        'junk.zip',
        'new (2).zip',
        'new.zip',
        'old.zip',
    ])
    expect(names(collectFiles(dir, { include: { exts: ['zip'] }, ignoreDirs: ['nested', 'node_modules'] }))).toEqual([
        'new (2).zip',
        'new.zip',
        'old.zip',
    ])
})

test('exclude by name and glob pattern', () => {
    const files = collectFiles(dir, { exclude: { names: ['old'], patterns: ['*.md', '*.ts'] } })
    expect(names(files)).toEqual(['deep.zip', 'new (2).zip', 'new.zip'])
})

test('include.dateRange is inclusive on both ends', () => {
    expect(names(collectFiles(dir, { include: { dateRange: [at(1), at(6)] } }))).toEqual(['deep.zip', 'notes.md'])
    expect(names(collectFiles(dir, { include: { dateRange: [at(10), undefined] } }))).toEqual([
        'new (2).zip',
        'new.zip',
        'thing.ts',
    ])
})

test('include and exclude compose', () => {
    const files = collectFiles(dir, {
        include: { exts: ['zip'], dateRange: [undefined, at(11)] },
        exclude: { patterns: [/^new\./] },
    })
    expect(names(files)).toEqual(['deep.zip', 'old.zip'])
})

test('empty criteria objects filter nothing out', () => {
    expect(collectFiles(dir, { include: {}, exclude: {} }).length).toBe(6)
})

test('getMostRecentFile skips duplicate-suffixed files by default', () => {
    expect(path.basename(getMostRecentFile({ dir })!)).toBe('new.zip')
    expect(path.basename(getMostRecentFile({ dir, exclude: {} })!)).toBe('new (2).zip')
})

test('getMostRecentFile is top level only, newest first', () => {
    expect(path.basename(getMostRecentFile({ dir, include: { exts: ['md'] } })!)).toBe('notes.md')
    expect(getMostRecentFile({ dir, include: { exts: ['tar.gz'] } })).toBeNull()
    expect(getMostRecentFile({ dir: path.join(dir, 'nope') })).toBeNull()
})
