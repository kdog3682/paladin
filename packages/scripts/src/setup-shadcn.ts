//
// bootstraps ~/projects/paladin/packages/shadcn as a shared component package
//
//   bun scripts/setup-shadcn.ts              # installs every shadcn component
//   bun scripts/setup-shadcn.ts button card  # installs only these
//
// flags:
//   --force         overwrite existing config files (theme.css, components.json, tsconfig)
//   --skip-install  don't run bun add
//   --skip-add      don't run the shadcn cli

import {$} from 'bun'
import {existsSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'

const ROOT = process.env.PALADIN_ROOT ?? join(homedir(), 'projects', 'paladin')
const PKG_DIR = join(ROOT, 'packages', 'shadcn')

const argv = process.argv.slice(2)
const flags = new Set(argv.filter(a => a.startsWith('-')))
const components = argv.filter(a => !a.startsWith('-'))

const FORCE = flags.has('--force')
const SKIP_INSTALL = flags.has('--skip-install')
const SKIP_ADD = flags.has('--skip-add')

// base-nova is the current default style (Base UI primitives). radix-nova for radix.
const STYLE = process.env.SHADCN_STYLE ?? 'base-nova'
const BASE_COLOR = process.env.SHADCN_BASE_COLOR ?? 'neutral'

const DEPS = [
  'shadcn',
  'cn',
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  'lucide-react',
  'tw-animate-css',
  'sonner',
  'tailwindcss',
]

const DEV_DEPS = [
  '@tailwindcss/cli',
  'react',
  'react-dom',
  '@types/react',
  '@types/react-dom',
  'typescript',
]

/* ------------------------------------------------------------------ helpers */

const log = (msg: string) => console.log(msg)

const write = async (rel: string, content: string, {overwrite = true} = {}) => {
  const abs = join(PKG_DIR, rel)
  if (existsSync(abs) && !overwrite && !FORCE) {
    log('  skip   ' + rel + ' (exists)')
    return
  }
  await mkdir(dirname(abs), {recursive: true})
  await Bun.write(abs, content)
  log('  write  ' + rel)
}

const readJson = async (abs: string): Promise<Record<string, any> | null> => {
  if (!existsSync(abs)) return null
  try {
    return JSON.parse(await Bun.file(abs).text())
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------- content */

const PKG_JSON = {
  name: '@paladin/shadcn',
  version: '0.0.0',
  private: true,
  type: 'module',
  sideEffects: ['*.css'],
  main: './src/index.ts',
  module: './src/index.ts',
  types: './src/index.ts',
  exports: {
    '.': './src/index.ts',
    // precompiled, already pulled in by the barrel - only import it by hand if
    // you strip the css import out of src/index.ts
    './styles.css': './dist/styles.css',
    // for apps that would rather compile this package with their own tailwind
    './source.css': './src/styles/source.css',
    './theme.css': './src/styles/theme.css',
    './ui/*': './src/components/ui/*.tsx',
    './lib/*': './src/lib/*.ts',
    './hooks/*': './src/hooks/*.ts',
    './components.json': './components.json',
  },
  // shadcn generates imports against these, and they resolve from any consumer
  // without the consumer needing an alias of its own
  imports: {
    '#components/*': './src/components/*.tsx',
    '#lib/*': './src/lib/*.ts',
    '#hooks/*': './src/hooks/*.ts',
  },
  scripts: {
    add: 'bunx --bun shadcn@latest add',
    barrel: 'bun scripts/generate-barrel.ts',
    'build:css': 'bun scripts/build-css.ts',
    sync: 'bun scripts/generate-barrel.ts && bun scripts/build-css.ts',
  },
  peerDependencies: {
    react: '>=18',
    'react-dom': '>=18',
  },
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ESNext',
    lib: ['ESNext', 'DOM', 'DOM.Iterable'],
    module: 'Preserve',
    moduleResolution: 'bundler',
    moduleDetection: 'force',
    resolvePackageJsonImports: true,
    allowImportingTsExtensions: true,
    jsx: 'react-jsx',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src', 'scripts'],
}

const COMPONENTS_JSON = {
  $schema: 'https://ui.shadcn.com/schema.json',
  style: STYLE,
  rsc: false,
  tsx: true,
  tailwind: {
    config: '',
    css: 'src/styles/globals.css',
    baseColor: BASE_COLOR,
    cssVariables: true,
    prefix: '',
  },
  aliases: {
    components: '#components',
    utils: '#lib/utils',
    ui: '#components/ui',
    lib: '#lib',
    hooks: '#hooks',
  },
  iconLibrary: 'lucide',
}

const UTILS_TS = `// @paladin/shadcn/src/lib/utils.ts
export {cn} from 'cn'
`

const CSS_DTS = `// @paladin/shadcn/src/css.d.ts
declare module '*.css'
`

// the css entry the shadcn cli writes to, and the input for the precompiled build
const GLOBALS_CSS = String.raw`@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./theme.css";

/* explicit sources: tailwind skips node_modules during auto-detection, so this
   is what makes the package compile correctly from a consumer's build too */
@source "../components";
@source "../hooks";
@source "../lib";
`

const THEME_CSS = String.raw`@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`

const BUILD_CSS_TS = String.raw`// @paladin/shadcn/scripts/build-css.ts
//
// compiles the package's own tailwind output to dist/styles.css, which the
// barrel imports - so a consumer gets styles just by importing a component.
//
// also emits src/styles/source.css: the same graph minus the tailwind import,
// for apps that would rather compile this package with their own build.

import {join} from 'node:path'

const PKG = join(import.meta.dir, '..')
const GLOBALS = join(PKG, 'src', 'styles', 'globals.css')
const SOURCE = join(PKG, 'src', 'styles', 'source.css')

const TAILWIND_IMPORT_RE = /^\s*@import\s+['"]tailwindcss['"][^;]*;\s*$/

const globals = await Bun.file(GLOBALS).text()
const stripped = globals
  .split('\n')
  .filter(line => !TAILWIND_IMPORT_RE.test(line))
  .join('\n')

const header = [
  '/* generated by scripts/build-css.ts - do not edit */',
  '/* app tailwind entry: @import "@paladin/shadcn/source.css"; */',
  '',
  '',
].join('\n')

await Bun.write(SOURCE, header + stripped)

const proc = Bun.spawn(
  ['bunx', '--bun', '@tailwindcss/cli', '-i', './src/styles/globals.css', '-o', './dist/styles.css', '--minify'],
  {cwd: PKG, stdout: 'inherit', stderr: 'inherit'},
)

const code = await proc.exited
if (code !== 0) process.exit(code)

const size = Bun.file(join(PKG, 'dist', 'styles.css')).size
console.log('css: dist/styles.css (' + Math.round(size / 1024) + 'kb) + src/styles/source.css')
`

const GENERATE_BARREL_TS = String.raw`// @paladin/shadcn/scripts/generate-barrel.ts
//
// scans src/ and regenerates src/index.ts so consumers can do
//   import {Button, toast, cn} from '@paladin/shadcn'
//
// re-run after every shadcn add: bun run sync

import {Glob} from 'bun'
import {join} from 'node:path'

const SRC = join(import.meta.dir, '..', 'src')

// set PALADIN_SHADCN_AUTO_CSS=0 to keep the barrel free of the css import and
// have consumers import '@paladin/shadcn/styles.css' themselves
const AUTO_CSS = process.env.PALADIN_SHADCN_AUTO_CSS !== '0'

const PATTERNS = ['components/ui/*.tsx', 'components/*.tsx', 'lib/*.ts', 'hooks/*.ts', 'hooks/*.tsx']

// [module, values, types] appended verbatim after the scanned files
const EXTRA: Array<[string, string[], string[]]> = [
  ['clsx', ['clsx'], ['ClassValue']],
  ['tailwind-merge', ['twMerge'], []],
  ['class-variance-authority', ['cva'], ['VariantProps']],
  ['sonner', ['toast'], []],
]

const VALUE_RE = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g
const TYPE_DECL_RE = /export\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/g
const TYPE_BLOCK_RE = /export\s+type\s*\{([^}]*)\}/g
const BLOCK_RE = /export\s*\{([^}]*)\}/g
const IDENT_RE = /^[A-Za-z0-9_$]+$/

const parseBlock = (body: string) => {
  const values: string[] = []
  const types: string[] = []
  for (const raw of body.split(',')) {
    const part = raw.trim()
    if (!part || part === 'default') continue
    const isType = part.startsWith('type ')
    const cleaned = isType ? part.slice(5).trim() : part
    const name = cleaned.includes(' as ') ? cleaned.split(' as ')[1].trim() : cleaned
    if (!IDENT_RE.test(name) || name === 'default') continue
    if (isType) types.push(name)
    else values.push(name)
  }
  return {values, types}
}

const files = new Set<string>()
for (const pattern of PATTERNS) {
  for await (const rel of new Glob(pattern).scan({cwd: SRC, onlyFiles: true})) {
    const norm = rel.split('\\').join('/')
    if (norm === 'index.ts') continue
    files.add(norm)
  }
}

const seen = new Set<string>()
const skipped: string[] = []
const lines: string[] = []

const take = (names: string[], origin: string) => {
  const out: string[] = []
  for (const name of new Set(names)) {
    if (seen.has(name)) {
      skipped.push(name + ' from ' + origin)
      continue
    }
    seen.add(name)
    out.push(name)
  }
  return out.sort()
}

const emit = (mod: string, values: string[], types: string[]) => {
  const v = take(values, mod)
  const t = take(types, mod)
  if (v.length) lines.push('export {' + v.join(', ') + "} from '" + mod + "'")
  if (t.length) lines.push('export type {' + t.join(', ') + "} from '" + mod + "'")
}

for (const rel of [...files].sort()) {
  const text = await Bun.file(join(SRC, rel)).text()
  const values: string[] = []
  const types: string[] = []

  for (const m of text.matchAll(VALUE_RE)) values.push(m[1])
  for (const m of text.matchAll(TYPE_DECL_RE)) types.push(m[1])
  for (const m of text.matchAll(TYPE_BLOCK_RE)) {
    const parsed = parseBlock(m[1])
    types.push(...parsed.values, ...parsed.types)
  }
  for (const m of text.matchAll(BLOCK_RE)) {
    const parsed = parseBlock(m[1])
    values.push(...parsed.values)
    types.push(...parsed.types)
  }

  const mod = './' + rel.replace(/\.tsx?$/, '')
  emit(mod, values, types)
}

for (const [mod, values, types] of EXTRA) emit(mod, values, types)

const header = [
  '// @paladin/shadcn/src/index.ts',
  '// generated by scripts/generate-barrel.ts - do not edit by hand',
  '',
]

if (AUTO_CSS) {
  header.push('// precompiled by scripts/build-css.ts - this is what makes the package drop-in')
  header.push("import '../dist/styles.css'")
  header.push('')
}

await Bun.write(join(SRC, 'index.ts'), header.concat(lines).join('\n') + '\n')

console.log('barrel: ' + seen.size + ' exports from ' + files.size + ' files')
if (skipped.length) console.log('barrel: name collisions skipped -> ' + skipped.join(', '))
`

const TICK = '`'

const README_MD = String.raw`# @paladin/shadcn

Every shadcn component, sonner and ` + TICK + 'cn' + TICK + String.raw`, in one workspace package.

## use

    import {Button, Card, toast, cn} from '@paladin/shadcn'

That is the whole setup. The barrel imports the package's own precompiled
stylesheet, so there is nothing to add to the app's css. Render ` + TICK + '<Toaster />' + String.raw`
once at the app root and you are done.

Deep imports work too, if you want to skip the barrel:

    import {Button} from '@paladin/shadcn/ui/button'

## the other two modes

**Compile from source.** If the app runs tailwind itself and you would rather
have one build with no duplicated preflight - and you want the app's own markup
to be able to use ` + TICK + 'bg-background' + TICK + String.raw` and friends - add one line to the app's
tailwind entry:

    @import "@paladin/shadcn/source.css";

That file carries its own ` + TICK + '@source' + TICK + String.raw` directives, so the app does not need to
know where this package lives. Then set ` + TICK + 'PALADIN_SHADCN_AUTO_CSS=0' + TICK + String.raw` and re-run
` + TICK + 'bun run barrel' + TICK + String.raw` to drop the css import from the barrel.

**Manual.** Same as above, but import ` + TICK + "'@paladin/shadcn/styles.css'" + TICK + String.raw` from the app
root instead of using tailwind at all.

## adding or updating components

    cd packages/shadcn
    bun run add dialog     # or: bun run add --all --overwrite
    bun run sync           # regenerate src/index.ts + dist/styles.css

` + TICK + 'bun run sync' + TICK + String.raw` matters: the precompiled stylesheet only contains classes the
components in this package actually use, so it has to be rebuilt whenever
components change.

Components resolve their own imports through ` + TICK + 'package.json#imports' + TICK + String.raw`
(` + TICK + '#components/ui/button' + TICK + String.raw`, ` + TICK + '#lib/utils' + TICK + String.raw`), so nothing in a consuming app needs a
path alias.
`

/* ---------------------------------------------------------------------- run */

log('paladin shadcn setup -> ' + PKG_DIR)

await mkdir(join(PKG_DIR, 'src', 'components', 'ui'), {recursive: true})
await mkdir(join(PKG_DIR, 'src', 'hooks'), {recursive: true})
await mkdir(join(PKG_DIR, 'src', 'lib'), {recursive: true})
await mkdir(join(PKG_DIR, 'src', 'styles'), {recursive: true})
await mkdir(join(PKG_DIR, 'scripts'), {recursive: true})

// package.json: merge so a hand-edited one keeps its deps
const existingPkg = (await readJson(join(PKG_DIR, 'package.json'))) ?? {}
const mergedPkg = {
  ...PKG_JSON,
  ...existingPkg,
  exports: {...PKG_JSON.exports, ...(existingPkg.exports ?? {})},
  imports: {...PKG_JSON.imports, ...(existingPkg.imports ?? {})},
  scripts: {...PKG_JSON.scripts, ...(existingPkg.scripts ?? {})},
  peerDependencies: {...PKG_JSON.peerDependencies, ...(existingPkg.peerDependencies ?? {})},
}
await write('package.json', JSON.stringify(mergedPkg, null, 2) + '\n')

await write('tsconfig.json', JSON.stringify(TSCONFIG, null, 2) + '\n', {overwrite: false})
await write('components.json', JSON.stringify(COMPONENTS_JSON, null, 2) + '\n', {overwrite: false})
await write('src/styles/globals.css', GLOBALS_CSS, {overwrite: false})
await write('src/styles/theme.css', THEME_CSS, {overwrite: false})
await write('src/lib/utils.ts', UTILS_TS, {overwrite: false})
await write('src/css.d.ts', CSS_DTS)
await write('scripts/generate-barrel.ts', GENERATE_BARREL_TS)
await write('scripts/build-css.ts', BUILD_CSS_TS)
await write('README.md', README_MD, {overwrite: false})

// make sure the workspace root actually claims packages/*
const rootPkgPath = join(ROOT, 'package.json')
const rootPkg = await readJson(rootPkgPath)
if (!rootPkg) {
  await Bun.write(
    rootPkgPath,
    JSON.stringify({name: 'paladin', private: true, workspaces: ['packages/*', 'apps/*']}, null, 2) + '\n',
  )
  log('  write  ../../package.json (workspace root)')
} else {
  const list: string[] = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : (rootPkg.workspaces?.packages ?? [])
  const covered = list.some(p => p === 'packages/*' || p === 'packages/shadcn')
  if (!covered) {
    const next = [...list, 'packages/*']
    if (Array.isArray(rootPkg.workspaces) || !rootPkg.workspaces) rootPkg.workspaces = next
    else rootPkg.workspaces.packages = next
    await Bun.write(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n')
    log('  patch  ../../package.json workspaces += packages/*')
  }
}

if (!SKIP_INSTALL) {
  log('\ninstalling dependencies')
  await $`bun add ${DEPS}`.cwd(PKG_DIR)
  await $`bun add -d ${DEV_DEPS}`.cwd(PKG_DIR)
}

if (!SKIP_ADD) {
  const target = components.length ? components : ['--all']
  log('\nadding components: ' + target.join(' '))
  const res = await $`bunx --bun shadcn@latest add ${target} --yes --overwrite --cwd ${PKG_DIR}`
    .cwd(PKG_DIR)
    .nothrow()
  if (res.exitCode !== 0) {
    log('\nshadcn cli exited ' + res.exitCode + ' - fix the above, then re-run with --skip-install')
  }
}

log('\nbuilding css')
await $`bun scripts/build-css.ts`.cwd(PKG_DIR)

log('\ngenerating barrel')
await $`bun scripts/generate-barrel.ts`.cwd(PKG_DIR)

log('\ndone. in a consuming app, this is the whole setup:')
log("  import {Button, toast, cn} from '@paladin/shadcn'")
log('\nafter any shadcn add: cd packages/shadcn && bun run sync')
