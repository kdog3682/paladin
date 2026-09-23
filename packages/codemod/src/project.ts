import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { IndentationText, Project, QuoteKind, ts } from 'ts-morph'

const PROJECTS = join(homedir(), 'projects')

const IGNORED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'assets',
  'public',
  'static',
  '.next',
  '.turbo',
  '.cache'
]

/** Used when the target dir has no tsconfig of its own, and as the base for in-memory projects. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  strict: true,
  allowJs: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  noEmit: true
}

const MANIPULATION_SETTINGS = {
  indentationText: IndentationText.TwoSpaces,
  quoteKind: QuoteKind.Double,
  useTrailingCommas: true,
  semicolons: ts.SemicolonPreference.Remove
}

export function sourceGlobs(dir: string) {
  return [
    join(dir, '**/*.{ts,tsx,mts,cts}'),
    `!${join(dir, '**/*.d.ts')}`,
    ...IGNORED_DIRS.map(name => `!${join(dir, '**', name, '**')}`)
  ]
}

/** `~/foo`, `./foo` and `/foo` resolve literally; a bare `repo/pkg` resolves under ~/projects. */
export function resolveProjectDir(spec: string) {
  if (spec.startsWith('~')) return join(homedir(), spec.slice(1))
  if (isAbsolute(spec) || spec.startsWith('.')) return resolve(spec)

  const [repo, ...rest] = spec.split('/')
  const root = join(PROJECTS, repo)
  if (rest.length === 0) return root

  const candidates = [join(root, 'packages', ...rest), join(root, 'apps', ...rest), join(root, ...rest)]
  return candidates.find(existsSync) ?? candidates[0]
}

export function findTsConfig(dir: string): string | undefined {
  const { root } = parse(dir)
  let current = dir

  while (true) {
    const candidate = join(current, 'tsconfig.json')
    if (existsSync(candidate)) return candidate
    if (current === root) return undefined
    current = dirname(current)
  }
}

/** Resolved, existing directory for a spec; a file path resolves to its containing dir. */
export function projectRoot(spec: string) {
  const target = resolveProjectDir(spec)
  if (!existsSync(target)) throw new Error(`no such project: ${spec} -> ${target}`)

  return statSync(target).isDirectory() ? target : dirname(target)
}

// Files always come from our own globs rather than the tsconfig's `include`: the spec's dir is
// the unit of work, and a monorepo tsconfig would otherwise drag in the whole repo. The tsconfig
// is still loaded, for its compilerOptions.
//
// `files`, when given, are loaded instead of the full glob: paths relative to `dir` (or
// absolute). Use this to load just the files a codemod needs, rather than paying to parse an
// entire (possibly large) package every run.
export function createProject(spec: string, files?: string[]) {
  const dir = projectRoot(spec)
  const tsConfigFilePath = findTsConfig(dir)

  const project = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: tsConfigFilePath ? undefined : COMPILER_OPTIONS,
    manipulationSettings: MANIPULATION_SETTINGS
  })

  if (files?.length) {
    project.addSourceFilesAtPaths(files.map(file => (isAbsolute(file) ? file : join(dir, file))))
  } else {
    project.addSourceFilesAtPaths(sourceGlobs(dir))
  }

  if (project.getSourceFiles().length === 0) throw new Error(`no source files found in ${dir}`)

  return project
}

/** Same settings as a real project, minus `lib` (no lib files to read off an in-memory fs). */
export function createMemoryProject() {
  const { lib: _lib, ...compilerOptions } = COMPILER_OPTIONS

  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions,
    manipulationSettings: { ...MANIPULATION_SETTINGS, useTrailingCommas: false }
  })
}
