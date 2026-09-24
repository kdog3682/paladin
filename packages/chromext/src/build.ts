import {existsSync} from 'node:fs'
import {cp, mkdir, readdir, rm} from 'node:fs/promises'
import path from 'node:path'
import {zipSync} from 'fflate'
import type {BuildConfig, BuildOutput} from 'bun'

/*
 * build any mv3 extension by convention
 *
 *   bun src/build.ts <name>          minified production build
 *   bun src/build.ts <name> --dev    unminified with inline sourcemaps
 *
 * or programmatically via build()
 *
 * the extension to build lives in src/<name>/, name is required
 * entrypoints are discovered in src/<name>/, all optional
 *
 *   background.ts                 service worker (esm)
 *   content.ts | content/*.ts     content scripts (iife), one per file or per content/<name>/index.ts
 *   popup | options | sidepanel | newtab | devtools
 *                                 pages, either <name>.html / <name>/index.html (bundled as html)
 *                                 or just <name>.ts / <name>/index.ts (an html shell is generated)
 *
 * content scripts take metadata from leading comments, matches defaults to <all_urls>
 *
 *   // @matches https://github.com/*, https://gist.github.com/*
 *   // @exclude_matches https://github.com/settings/*
 *   // @run_at document_start
 *   // @all_frames
 *   // @world MAIN
 *
 * a sibling <name>.css is injected alongside its content script
 *
 * permissions are inferred by scanning the bundled output for chrome.* api usage,
 * host_permissions default to <all_urls> when an api that needs host access is used
 *
 * src/<name>/public/ is copied verbatim into the build, public/icon-<size>.png or public/icons/icon<size>.png
 * are picked up as icons
 *
 * src/<name>/ext.config.ts may default export a partial manifest, deep merged last,
 * its permissions are added to the detected ones and omitPermissions removes any
 *
 * the result is built to dist/<name> and copied to <dldir>/<name> (load unpacked),
 * with zip: true it is also zipped to <dldir>/<name>.zip
 */

export type BuildOpts = {
  /* package root, defaults to the parent of this file's directory */
  root?: string
  /* the src/<name> dir to build, also the output name */
  name: string
  /* unminified with inline sourcemaps */
  dev?: boolean
  /* where to pack the result, defaults to process.env.DLDIR, false skips packing */
  dldir?: string | false
  /* also zip the result to <dldir>/<name>.zip, defaults to false */
  zip?: boolean
}

export type BuildResult = {
  /* the generated manifest.json contents */
  manifest: Record<string, unknown>
  /* the build output directory */
  dist: string
  /* unpacked copy, ready for load unpacked */
  unpacked?: string
  /* zipped copy, only when zip: true */
  zip?: string
}

type Manifest = chrome.runtime.ManifestV3

type ExtConfig = Partial<Manifest> & {
  /* permissions to drop even when detected */
  omitPermissions?: string[]
}

type Pkg = {
  name?: string
  version?: string
  description?: string
  /* extension name shown in chrome, defaults to the package name */
  displayName?: string
}

type Ctx = {
  name: string
  root: string
  src: string
  dist: string
  pub: string
  dev: boolean
}

type ContentEntry = {
  name: string
  file: string
  matches: string[]
  excludeMatches?: string[]
  runAt?: string
  allFrames?: boolean
  world?: string
  /* sibling stylesheet, if any */
  css?: string
}

type PageName = typeof PAGES[number]

type Page = {
  name: PageName
  /* html entry, takes priority over script */
  html?: string
  /* script entry used when there is no html, a shell page is generated */
  script?: string
}

type Entries = {
  background?: string
  content: ContentEntry[]
  pages: Page[]
}

type Built = {
  background?: string
  content: Record<string, unknown>[]
  pages: Partial<Record<PageName, string>>
}

const PAGES = ['popup', 'options', 'sidepanel', 'newtab', 'devtools'] as const
const SCRIPT_EXTS = ['.ts', '.tsx', '.js', '.jsx']

/* chrome.<namespace> → permission, namespaces absent here need no permission */
const API_PERMISSIONS: Record<string, string> = {
  alarms: 'alarms',
  bookmarks: 'bookmarks',
  browsingData: 'browsingData',
  contentSettings: 'contentSettings',
  contextMenus: 'contextMenus',
  cookies: 'cookies',
  debugger: 'debugger',
  declarativeNetRequest: 'declarativeNetRequest',
  desktopCapture: 'desktopCapture',
  downloads: 'downloads',
  fontSettings: 'fontSettings',
  gcm: 'gcm',
  history: 'history',
  identity: 'identity',
  idle: 'idle',
  management: 'management',
  notifications: 'notifications',
  offscreen: 'offscreen',
  pageCapture: 'pageCapture',
  power: 'power',
  privacy: 'privacy',
  proxy: 'proxy',
  readingList: 'readingList',
  scripting: 'scripting',
  search: 'search',
  sessions: 'sessions',
  sidePanel: 'sidePanel',
  storage: 'storage',
  tabCapture: 'tabCapture',
  tabGroups: 'tabGroups',
  tabs: 'tabs',
  topSites: 'topSites',
  tts: 'tts',
  ttsEngine: 'ttsEngine',
  userScripts: 'userScripts',
  webNavigation: 'webNavigation',
  webRequest: 'webRequest',
}

/* chrome.<namespace>.<member> → extra permission */
const MEMBER_PERMISSIONS: Record<string, string> = {
  'downloads.open': 'downloads.open',
  'downloads.setUiOptions': 'downloads.ui',
  'system.cpu': 'system.cpu',
  'system.display': 'system.display',
  'system.memory': 'system.memory',
  'system.storage': 'system.storage',
}

/* apis that do nothing useful without host access */
const HOST_APIS = ['scripting', 'cookies', 'webRequest', 'tabs.captureVisibleTab']

// ─── helpers ────────────────────────────────────────────────────────────────

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

const toPosix = (p: string) => p.split(path.sep).join('/')

const firstExisting = (candidates: string[]) => candidates.find(c => existsSync(c))

const isScript = (file: string) =>
  SCRIPT_EXTS.includes(path.extname(file)) && !/\.(test|spec|demo|d)\.[jt]sx?$/.test(file)

/* <base>.ts or <base>/index.ts */
const findScript = (base: string) => firstExisting([
  ...SCRIPT_EXTS.map(e => base + e),
  ...SCRIPT_EXTS.map(e => path.join(base, 'index' + e)),
])

/* <base>.html or <base>/index.html */
const findHtml = (base: string) => firstExisting([base + '.html', path.join(base, 'index.html')])

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const merge = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const out = {...a}
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k]
    out[k] = isObj(prev) && isObj(v) ? merge(prev, v) : v
  }
  return out
}

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const distPath = (ctx: Ctx, p: string) => toPosix(path.relative(ctx.dist, p))

const writeIfMissing = async (ctx: Ctx, file: string, content: string) => {
  if (existsSync(file)) return
  await Bun.write(file, content)
  console.log(`created ${toPosix(path.relative(ctx.root, file))}`)
}

const run = async (ctx: Ctx, config: BuildConfig): Promise<BuildOutput['outputs']> => {
  const result = await Bun.build({
    target: 'browser',
    minify: !ctx.dev,
    sourcemap: ctx.dev ? 'inline' : 'none',
    splitting: false,
    ...config,
  })
  if (!result.success) {
    throw new AggregateError(result.logs, `bundling ${config.entrypoints.join(', ')} failed`)
  }
  return result.outputs
}

// ─── scaffold ───────────────────────────────────────────────────────────────

const scaffold = async (ctx: Ctx) => {
  const dirName = path.basename(ctx.root)

  await writeIfMissing(ctx, path.join(ctx.root, 'package.json'), json({
    name: `@paladin/${dirName}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'bun src/build.ts',
      dev: 'bun src/build.ts --dev',
    },
    devDependencies: {
      '@types/bun': 'latest',
      '@types/chrome': 'latest',
      typescript: 'latest',
    },
  }))

  await writeIfMissing(ctx, path.join(ctx.root, 'tsconfig.json'), json({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      lib: ['ESNext', 'DOM', 'DOM.Iterable'],
      types: ['bun', 'chrome'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['src'],
  }))
}

/* an extension needs at least one entrypoint, fall back to a bare service worker */
const scaffoldBackground = async (ctx: Ctx, pkg: Pkg) => {
  const file = path.join(ctx.src, 'background.ts')
  await writeIfMissing(ctx, file, [
    `// ${pkg.name ?? '@paladin/ext'}/src/background.ts`,
    '',
    'chrome.runtime.onInstalled.addListener(({reason}) => {',
    '  console.log(`installed: ${reason}`)',
    '})',
    '',
  ].join('\n'))
  return file
}

// ─── discovery ──────────────────────────────────────────────────────────────

/* read // @key value lines from the leading comment block */
const parseMeta = (source: string) => {
  const meta: Record<string, string> = {}
  for (const line of source.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (!t.startsWith('//')) break
    const m = t.match(/^\/\/\s*@([\w-]+)\s*(.*)$/)
    if (m) meta[m[1]!] = m[2]!.trim()
  }
  return meta
}

const splitList = (s: string | undefined) => s?.split(/[\s,]+/).filter(Boolean)

const findContentScripts = async (ctx: Ctx): Promise<ContentEntry[]> => {
  const dir = path.join(ctx.src, 'content')
  const found: {name: string, file: string}[] = []

  const single = firstExisting(SCRIPT_EXTS.map(e => dir + e))
  if (single) found.push({name: 'content', file: single})

  if (existsSync(dir)) {
    for (const d of await readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, d.name)
      if (d.isFile() && isScript(d.name)) {
        const name = path.basename(d.name, path.extname(d.name))
        found.push({name: name === 'index' ? 'content' : name, file: full})
      } else if (d.isDirectory()) {
        const file = findScript(full)
        if (file) found.push({name: d.name, file})
      }
    }
  }

  return Promise.all(found.map(async ({name, file}) => {
    const meta = parseMeta(await Bun.file(file).text())
    const css = file.replace(/\.[jt]sx?$/, '.css')
    return {
      name,
      file,
      matches: splitList(meta.matches) ?? ['<all_urls>'],
      excludeMatches: splitList(meta.exclude_matches),
      runAt: meta.run_at,
      allFrames: 'all_frames' in meta ? meta.all_frames !== 'false' : undefined,
      world: meta.world,
      css: existsSync(css) ? css : undefined,
    }
  }))
}

const findPages = (ctx: Ctx): Page[] => PAGES.flatMap(name => {
  const base = path.join(ctx.src, name)
  const html = findHtml(base)
  const script = html ? undefined : findScript(base)
  return html || script ? [{name, html, script}] : []
})

const discover = async (ctx: Ctx): Promise<Entries> => ({
  background: findScript(path.join(ctx.src, 'background')),
  content: await findContentScripts(ctx),
  pages: findPages(ctx),
})

// ─── bundling ───────────────────────────────────────────────────────────────

const pageShell = (title: string, script: string, css: string[]) => [
  '<!doctype html>',
  '<html>',
  '  <head>',
  '    <meta charset="utf-8">',
  '    <meta name="viewport" content="width=device-width, initial-scale=1">',
  `    <title>${title}</title>`,
  ...css.map(c => `    <link rel="stylesheet" href="./${c}">`),
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  `    <script type="module" src="./${script}"></script>`,
  '  </body>',
  '</html>',
  '',
].join('\n')

const buildBackground = async (ctx: Ctx, file: string) => {
  const outputs = await run(ctx, {
    entrypoints: [file],
    outdir: ctx.dist,
    format: 'esm',
    naming: {entry: 'background.[ext]', asset: 'assets/[name]-[hash].[ext]'},
  })
  return distPath(ctx, outputs.find(o => o.kind === 'entry-point')!.path)
}

const buildContent = async (ctx: Ctx, entry: ContentEntry) => {
  const outputs = await run(ctx, {
    entrypoints: [entry.file],
    outdir: ctx.dist,
    // content scripts are classic scripts, they cannot be esm
    format: 'iife',
    naming: {entry: `content/${entry.name}.[ext]`, asset: 'assets/[name]-[hash].[ext]'},
  })

  const js = distPath(ctx, outputs.find(o => o.kind === 'entry-point')!.path)
  const css = outputs.filter(o => o.path.endsWith('.css')).map(o => distPath(ctx, o.path))

  if (entry.css) {
    const out = `content/${entry.name}.style.css`
    await cp(entry.css, path.join(ctx.dist, out))
    css.push(out)
  }

  return {
    matches: entry.matches,
    ...(entry.excludeMatches && {exclude_matches: entry.excludeMatches}),
    js: [js],
    ...(css.length && {css}),
    ...(entry.runAt && {run_at: entry.runAt}),
    ...(entry.allFrames !== undefined && {all_frames: entry.allFrames}),
    ...(entry.world && {world: entry.world}),
  }
}

const buildPage = async (ctx: Ctx, page: Page, title: string) => {
  const naming = {
    entry: `${page.name}.[ext]`,
    chunk: `${page.name}-[hash].[ext]`,
    asset: `assets/[name]-[hash].[ext]`,
  }

  if (page.html) {
    const outputs = await run(ctx, {entrypoints: [page.html], outdir: ctx.dist, format: 'esm', naming})
    return distPath(ctx, outputs.find(o => o.path.endsWith('.html'))!.path)
  }

  const outputs = await run(ctx, {entrypoints: [page.script!], outdir: ctx.dist, format: 'esm', naming})
  const js = distPath(ctx, outputs.find(o => o.kind === 'entry-point')!.path)
  const css = outputs.filter(o => o.path.endsWith('.css')).map(o => distPath(ctx, o.path))
  const html = `${page.name}.html`
  await Bun.write(path.join(ctx.dist, html), pageShell(title, js, css))
  return html
}

const bundle = async (ctx: Ctx, entries: Entries, title: string): Promise<Built> => {
  await rm(ctx.dist, {recursive: true, force: true})
  await mkdir(ctx.dist, {recursive: true})

  // public first so bundled output wins on name clashes
  if (existsSync(ctx.pub)) await cp(ctx.pub, ctx.dist, {recursive: true})

  const built: Built = {content: [], pages: {}}

  if (entries.background) built.background = await buildBackground(ctx, entries.background)
  for (const entry of entries.content) built.content.push(await buildContent(ctx, entry))
  for (const page of entries.pages) built.pages[page.name] = await buildPage(ctx, page, title)

  return built
}

// ─── manifest ───────────────────────────────────────────────────────────────

/* every chrome.<ns> and chrome.<ns>.<member> referenced in the bundle */
const scanApis = async (ctx: Ctx) => {
  const apis = new Set<string>()
  const re = /\bchrome\s*\??\.\s*([A-Za-z]\w*)(?:\s*\??\.\s*([A-Za-z]\w*))?/g

  const files = (await readdir(ctx.dist, {recursive: true})).filter(f => /\.(m?js|html)$/.test(f))
  for (const f of files) {
    const text = await Bun.file(path.join(ctx.dist, f)).text()
    for (const [, ns, member] of text.matchAll(re)) {
      apis.add(ns!)
      if (member) apis.add(`${ns}.${member}`)
    }
  }
  return apis
}

const findIcons = async (ctx: Ctx) => {
  const icons: Record<string, string> = {}
  for (const dir of [ctx.pub, path.join(ctx.pub, 'icons')]) {
    if (!existsSync(dir)) continue
    for (const f of await readdir(dir)) {
      const m = f.match(/^icon[-_]?(\d+)\.png$/i)
      if (m) icons[m[1]!] = toPosix(path.relative(ctx.pub, path.join(dir, f)))
    }
  }
  return icons
}

const loadConfig = async (ctx: Ctx): Promise<ExtConfig> => {
  const file = firstExisting(['ext.config.ts', 'ext.config.js'].map(f => path.join(ctx.src, f)))
  return file ? (await import(file)).default ?? {} : {}
}

const createManifest = (opts: {
  pkg: Pkg
  title: string
  built: Built
  apis: Set<string>
  icons: Record<string, string>
  config: ExtConfig
}) => {
  const {pkg, title, built, apis, icons, config} = opts
  const {permissions: extraPerms = [], omitPermissions = [], ...overrides} = config
  const hasIcons = Object.keys(icons).length > 0

  const permissions = new Set<string>(extraPerms as string[])
  for (const api of apis) {
    const perm = API_PERMISSIONS[api] ?? MEMBER_PERMISSIONS[api]
    if (perm) permissions.add(perm)
  }
  for (const p of omitPermissions) permissions.delete(p)

  const needsHosts = HOST_APIS.some(a => apis.has(a))

  const manifest: Record<string, unknown> = {
    manifest_version: 3,
    name: title,
    // chrome only accepts 1-4 dot separated integers
    version: (pkg.version ?? '0.1.0').split(/[-+]/)[0],
    description: pkg.description ?? `${title} browser extension`,
  }

  if (hasIcons) manifest.icons = icons

  if (built.background) manifest.background = {service_worker: built.background, type: 'module'}

  if (built.content.length) manifest.content_scripts = built.content

  if (built.pages.popup || apis.has('action')) {
    manifest.action = {
      default_title: title,
      ...(built.pages.popup && {default_popup: built.pages.popup}),
      ...(hasIcons && {default_icon: icons}),
    }
  }

  if (built.pages.options) manifest.options_ui = {page: built.pages.options, open_in_tab: true}

  if (built.pages.sidepanel) {
    manifest.side_panel = {default_path: built.pages.sidepanel}
    permissions.add('sidePanel')
  }

  if (built.pages.newtab) manifest.chrome_url_overrides = {newtab: built.pages.newtab}

  if (built.pages.devtools) manifest.devtools_page = built.pages.devtools

  if (permissions.size) manifest.permissions = [...permissions].sort()

  if (needsHosts) manifest.host_permissions = ['<all_urls>']

  const final = merge(manifest, overrides as Record<string, unknown>)

  if (apis.has('sidePanel') && !final.side_panel) console.warn('warn: chrome.sidePanel used but no sidepanel page found')
  if (apis.has('omnibox') && !final.omnibox) console.warn('warn: chrome.omnibox used, set omnibox.keyword in ext.config.ts')
  if (apis.has('commands') && !final.commands) console.warn('warn: chrome.commands used, define commands in ext.config.ts')

  return final
}

// ─── pack ───────────────────────────────────────────────────────────────────

const pack = async (ctx: Ctx, name: string, dldir: string, zip: boolean) => {
  const unpacked = path.join(dldir, name)
  const zipPath = path.join(dldir, `${name}.zip`)

  await rm(unpacked, {recursive: true, force: true})
  await cp(ctx.dist, unpacked, {recursive: true})
  console.log(`unpacked → ${unpacked}`)

  if (!zip) return {unpacked}

  const files: Record<string, Uint8Array> = {}
  for (const f of await readdir(ctx.dist, {recursive: true, withFileTypes: true})) {
    if (!f.isFile()) continue
    const full = path.join(f.parentPath, f.name)
    files[toPosix(path.relative(ctx.dist, full))] = new Uint8Array(await Bun.file(full).arrayBuffer())
  }
  await Bun.write(zipPath, zipSync(files))
  console.log(`zipped   → ${zipPath}`)
  return {unpacked, zip: zipPath}
}

// ─── build ──────────────────────────────────────────────────────────────────

export const build = async (opts: BuildOpts): Promise<BuildResult> => {
  const root = path.resolve(opts.root ?? path.join(import.meta.dir, '..'))
  const {name} = opts
  const src = path.join(root, 'src', name)
  if (!existsSync(src)) throw new Error(`no extension at ${src}`)
  const ctx: Ctx = {
    name,
    root,
    src,
    dist: path.join(root, 'dist', name),
    pub: path.join(src, 'public'),
    dev: opts.dev ?? false,
  }

  const dldir = opts.dldir === false ? undefined : opts.dldir ?? process.env.DLDIR
  if (opts.dldir !== false && !dldir) throw new Error('DLDIR is not set, pass dldir or set dldir: false')

  await scaffold(ctx)

  const pkg: Pkg = await Bun.file(path.join(root, 'package.json')).json()
  const title = pkg.displayName ?? titleCase(name)

  const entries = await discover(ctx)
  if (!entries.background && !entries.content.length && !entries.pages.length) {
    entries.background = await scaffoldBackground(ctx, pkg)
  }

  const built = await bundle(ctx, entries, title)
  const apis = await scanApis(ctx)
  const manifest = createManifest({
    pkg,
    title,
    built,
    apis,
    icons: await findIcons(ctx),
    config: await loadConfig(ctx),
  })

  await Bun.write(path.join(ctx.dist, 'manifest.json'), json(manifest))

  console.log(`built ${title} ${manifest.version}${ctx.dev ? ' (dev)' : ''}`)
  if (built.background) console.log(`  background  ${built.background}`)
  for (const c of built.content) console.log(`  content     ${(c.js as string[])[0]}  ${(c.matches as string[]).join(' ')}`)
  for (const [page, file] of Object.entries(built.pages)) console.log(`  ${page.padEnd(11)} ${file}`)
  console.log(`  permissions ${(manifest.permissions as string[] | undefined)?.join(' ') || 'none'}`)

  const packed = dldir ? await pack(ctx, name, dldir, opts.zip ?? false) : {}

  return {manifest, dist: ctx.dist, ...packed}
}

if (import.meta.main) {
  const name = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!name) throw new Error('usage: bun src/build.ts <name> [--dev]')
  await build({name, dev: process.argv.includes('--dev')})
}
