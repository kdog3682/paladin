import fs from 'node:fs'
import path from 'node:path'

export type FilePreset =
    | 'demo'
    | 'script'
    | 'test'
    | 'manifest'
    | 'types'
    | 'docs'
    | 'data'
    | 'nonsource'

export type FileCriteria = {
    exts?: string[]
    dateRange?: [Date?, Date?]
    size?: [number?, number?]
    names?: string[]
    patterns?: (string | RegExp)[]
    parts?: string[]
    presets?: FilePreset[]
}

// a dir to walk, a plain file path, or any mix of the two
export type CollectFilesInput = string | string[]

export type CollectFilesOpts = {
    include?: FileCriteria
    exclude?: FileCriteria
    recursive?: boolean
    ignoreDirs?: string[]
}

type GetMostRecentFileOpts = {
    dir?: CollectFilesInput
    include?: FileCriteria
    exclude?: FileCriteria
}

type FileRef = {
    filepath: string
    name: string
    stat: () => fs.Stats
}

// a preset is a bundle of name-ish rules that are OR'd together
type PresetRule = Pick<FileCriteria, 'names' | 'patterns' | 'parts'>

export const DEFAULT_IGNORE_DIRS = ['node_modules', '.git']

// 'archive (1).zip', 'archive (2).tar.gz', etc
export const DUPLICATE_SUFFIX_PATTERN = / \(\d+\)(\.[^/\\]*)?$/

// matching rules:
//   exclude always wins over include
//   within a criteria object:
//     exts AND dateRange AND size AND parts AND (names OR patterns OR presets)
//     within a single key the values are OR'd
//     an unset key is skipped entirely
//   names match the basename with or without its extension
//   patterns are RegExps, or globs supporting * and ?, tested
//     case-insensitively against both the basename and the full path
//   parts are plain path substrings, eg 'abc/foobar'
//   size is a [min, max] byte range, inclusive on both ends
//   presets are named bundles, see PRESETS below

const SEP = '[/\\\\]'

const extRe = (exts: string[]) => new RegExp(`\\.(?:${exts.join('|')})$`, 'i')

const dirRe = (dirs: string[]) => new RegExp(`(?:^|${SEP})(?:${dirs.join('|')})${SEP}`, 'i')

export const DOC_EXTS = ['md', 'mdx', 'markdown', 'txt', 'text', 'rst', 'adoc', 'org', 'rtf', 'pdf']

export const DATA_EXTS = [
    'json', 'jsonc', 'json5', 'jsonl', 'ndjson',
    'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'csv', 'tsv', 'xml', 'plist',
    'parquet', 'avro', 'sqlite', 'sqlite3', 'db',
]

// binaries and bundled artifacts that are also not source
export const ASSET_EXTS = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tiff',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
    'mp3', 'wav', 'flac', 'ogg', 'mp4', 'mov', 'webm',
    'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar',
]

export const DOC_NAMES = [
    'README', 'LICENSE', 'LICENCE', 'COPYING', 'NOTICE',
    'CHANGELOG', 'CHANGES', 'HISTORY', 'CONTRIBUTING',
    'CODE_OF_CONDUCT', 'SECURITY', 'AUTHORS', 'TODO',
]

// each preset entry matches if ANY of its names/patterns/parts hit
export const PRESETS: Record<FilePreset, PresetRule> = {
    // foobar.demo.ts, demos/foobar.ts, examples/foobar.ts
    demo: {
        patterns: [/\.(?:demo|example|sample)s?\.[^./\\]+$/i, dirRe(['demos?', 'examples?', 'samples?'])],
    },
    // build.sh, scripts/foobar.ts, bin/foobar, foobar.script.ts
    script: {
        patterns: [
            /\.scripts?\.[^./\\]+$/i,
            extRe(['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd']),
            dirRe(['scripts?', 'bin']),
        ],
    },
    // foobar.test.ts, foobar.spec.ts, tests/foobar.ts, test_foobar.py, foobar_test.go
    test: {
        patterns: [
            /\.(?:test|spec)\.[^./\\]+$/i,
            dirRe(['tests?', 'specs?', '__tests__', '__mocks__', 'e2e']),
            /(?:^|[/\\])test_[^/\\]+\.py$/i,
            /(?:^|[/\\])[^/\\]+_test\.(?:go|py|rb)$/i,
            /(?:^|[/\\])conftest\.py$/i,
        ],
    },
    // package.json, uv.lock, .gitignore, vite.config.ts, .prettierrc
    manifest: {
        names: [
            'package.json', 'package-lock.json', 'bun.lock', 'bun.lockb',
            'yarn.lock', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
            'deno.json', 'deno.jsonc', 'jsr.json',
            'tsconfig.json', 'jsconfig.json',
            'pyproject.toml', 'uv.lock', 'poetry.lock', 'requirements.txt',
            'setup.py', 'setup.cfg', 'Pipfile', 'Pipfile.lock',
            'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum',
            'Gemfile', 'Gemfile.lock', 'composer.json', 'composer.lock',
            'Makefile', 'justfile', 'Dockerfile',
            'docker-compose.yml', 'docker-compose.yaml',
            '.gitignore', '.gitattributes', '.dockerignore',
            '.npmrc', '.nvmrc', '.editorconfig',
        ],
        patterns: [
            /\.(?:config|conf)\.[^./\\]+$/i,
            /^\.[^./\\]*rc(?:\.[^./\\]+)?$/i,
            /\.lockb?$/i,
            /(?:^|[/\\])\.env(?:\.[^/\\]+)?$/i,
        ],
    },
    // foobar.d.ts, foobar.types.ts, types/foobar.ts, types.ts
    types: {
        names: ['types', 'typings'],
        patterns: [
            /\.d\.[cm]?ts$/i,
            /\.types?\.[^./\\]+$/i,
            dirRe(['@types', 'types?', 'typings']),
        ],
    },
    // README.md, notes.txt, docs/foobar.md
    docs: {
        names: DOC_NAMES,
        patterns: [extRe(DOC_EXTS), dirRe(['docs?', 'documentation'])],
    },
    // foobar.json, config.yaml, fixtures/foobar.csv
    data: {
        patterns: [extRe(DATA_EXTS), dirRe(['data', 'fixtures?', 'seeds?', '__snapshots__'])],
    },
    // everything above that isn't code, plus images, fonts, media and archives
    nonsource: {
        names: DOC_NAMES,
        patterns: [extRe([...DOC_EXTS, ...DATA_EXTS, ...ASSET_EXTS])],
    },
}

const toPosix = (p: string) => p.split(path.sep).join('/')

const normalizeExt = (ext: string) => '.' + ext.replace(/^\./, '').toLowerCase()

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const globCache = new Map<string, RegExp>()

export function globToRegExp(glob: string): RegExp {
    const cached = globCache.get(glob)
    if (cached) return cached
    const src = glob
        .split(/([*?])/)
        .map((piece) => (piece === '*' ? '.*' : piece === '?' ? '.' : escapeRegExp(piece)))
        .join('')
    const re = new RegExp(`^${src}$`, 'i')
    globCache.set(glob, re)
    return re
}

const toRegExp = (p: string | RegExp) => (p instanceof RegExp ? p : globToRegExp(p))

function hasCriteria(criteria?: FileCriteria): boolean {
    if (!criteria) return false
    const { exts, dateRange, size, names, patterns, parts, presets } = criteria
    return Boolean(
        exts?.length ||
            dateRange ||
            size ||
            names?.length ||
            patterns?.length ||
            parts?.length ||
            presets?.length,
    )
}

function matchesRange(value: number, from?: number, to?: number): boolean | undefined {
    if (from === undefined && to === undefined) return undefined
    if (from !== undefined && value < from) return false
    if (to !== undefined && value > to) return false
    return true
}

function matchesExts(name: string, exts?: string[]): boolean | undefined {
    if (!exts?.length) return undefined
    const lower = name.toLowerCase()
    return exts.some((ext) => lower.endsWith(normalizeExt(ext)))
}

function matchesDateRange(file: FileRef, dateRange?: [Date?, Date?]): boolean | undefined {
    if (!dateRange) return undefined
    const [from, to] = dateRange
    if (!from && !to) return undefined
    return matchesRange(file.stat().mtimeMs, from?.getTime(), to?.getTime())
}

function matchesSize(file: FileRef, size?: [number?, number?]): boolean | undefined {
    if (!size) return undefined
    const [min, max] = size
    if (min === undefined && max === undefined) return undefined
    return matchesRange(file.stat().size, min, max)
}

function matchesParts(filepath: string, parts?: string[]): boolean | undefined {
    if (!parts?.length) return undefined
    const posix = toPosix(filepath)
    return parts.some((part) => posix.includes(toPosix(part)))
}

function matchesNames(file: FileRef, criteria: FileCriteria): boolean | undefined {
    const { names, patterns, presets } = criteria
    if (!names?.length && !patterns?.length && !presets?.length) return undefined
    const stem = file.name.slice(0, file.name.length - path.extname(file.name).length)
    if (names?.some((n) => n === file.name || n === stem)) return true
    if (patterns?.some((p) => testPattern(p, file))) return true
    if (presets?.some((preset) => matchesPreset(file, PRESETS[preset]))) return true
    return false
}

function testPattern(pattern: string | RegExp, file: FileRef): boolean {
    const re = toRegExp(pattern)
    return re.test(file.name) || re.test(file.filepath) || re.test(toPosix(file.filepath))
}

function matchesPreset(file: FileRef, rule: PresetRule): boolean {
    return matchesNames(file, rule) === true || matchesParts(file.filepath, rule.parts) === true
}

// cheap checks first so stat() is only paid for by files that survive them
function matchesCriteria(file: FileRef, criteria?: FileCriteria): boolean {
    if (!criteria) return true
    return (
        matchesExts(file.name, criteria.exts) !== false &&
        matchesParts(file.filepath, criteria.parts) !== false &&
        matchesNames(file, criteria) !== false &&
        matchesDateRange(file, criteria.dateRange) !== false &&
        matchesSize(file, criteria.size) !== false
    )
}

function passesFilter(file: FileRef, include?: FileCriteria, exclude?: FileCriteria): boolean {
    if (hasCriteria(exclude) && matchesCriteria(file, exclude)) return false
    return matchesCriteria(file, include)
}

// dirs are walked, file paths are filtered in place, missing paths are skipped
// returns deduped filepaths in root then walk order, stat'ing only when a
// dateRange or size asks for it
export function collectFiles(input: CollectFilesInput, opts: CollectFilesOpts = {}): string[] {
    const { include, exclude, recursive = true, ignoreDirs = DEFAULT_IGNORE_DIRS } = opts
    const roots = (Array.isArray(input) ? input : [input]).filter(Boolean)
    if (!roots.length) throw new Error('no paths provided')

    const found = new Set<string>()
    const ignored = new Set(ignoreDirs)

    const consider = (filepath: string, name: string, known?: fs.Stats) => {
        let stat = known
        const file: FileRef = {
            filepath,
            name,
            stat: () => (stat ??= fs.statSync(filepath)),
        }
        if (passesFilter(file, include, exclude)) found.add(filepath)
    }

    const walk = (current: string) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const filepath = path.join(current, entry.name)
            if (entry.isDirectory()) {
                if (recursive && !ignored.has(entry.name)) walk(filepath)
                continue
            }
            if (!entry.isFile()) continue
            consider(filepath, entry.name)
        }
    }

    for (const root of roots) {
        if (!fs.existsSync(root)) continue
        const stat = fs.statSync(root)
        if (stat.isDirectory()) walk(root)
        else if (stat.isFile()) consider(root, path.basename(root), stat)
    }

    return [...found]
}

