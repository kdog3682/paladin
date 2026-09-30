import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {build, loadConfigFromFile, type InlineConfig, type Plugin, type PluginOption} from "vite"
import type {OutputAsset, RollupOutput} from "rollup"
import {viteSingleFile} from "vite-plugin-singlefile"
import {openInBrowser} from "@paladin/utils"

export type BuildReactAppOpts = {
  /* output name, defaults to the entry basename minus its extension and any ".app" suffix */
  name?: string
  /* where the html is written, defaults to ~/.paladin/apps */
  outDir?: string
  /* open the result in the browser once written, defaults to true */
  open?: boolean
  /*
   * last word on which plugins the build runs, given the package's own
   * (flattened, singlefile-free) ones — drop what does not belong in a build,
   * fill in what the package's config leaves out. singlefile is appended after.
   */
  plugins?: (userPlugins: Plugin[]) => PluginOption[] | Promise<PluginOption[]>
}

export type BuildReactAppResult = {
  /* absolute path of the written html */
  outFile: string
  /* package root vite ran in */
  root: string
  /* true when the entry was App.tsx and the package's own index.html was used */
  usedExisting: boolean
}

const CONFIG_NAMES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]
const SINGLEFILE_NAME = "vite:singlefile"

export async function buildReactApp(entryArg: string, opts: BuildReactAppOpts = {}): Promise<BuildReactAppResult> {
  const entry = path.resolve(expandHome(entryArg))
  if (!fs.existsSync(entry)) throw new Error(`entry not found: ${entry}`)

  const root = findPackageRoot(path.dirname(entry))
  const name = opts.name ?? appName(entry)
  const indexPath = path.join(root, "index.html")

  // App.tsx is assumed to already be wired up by the package's own index.html + main
  const usedExisting = path.basename(entry) === "App.tsx" && fs.existsSync(indexPath)

  const extra: Plugin[] = []
  let input = indexPath

  if (!usedExisting) {
    const htmlId = path.join(root, `__paladin__.${name}.html`)
    // main lives next to the entry so relative imports behave
    const mainId = path.join(path.dirname(entry), `__paladin_main__.${name}.tsx`)
    const mainSrc = "/" + toPosix(path.relative(root, mainId))
    extra.push(virtualFiles(root, new Map([
      [htmlId, defaultHtml(name, mainSrc)],
      [mainId, virtualMain(entry, path.dirname(mainId))],
    ])))
    input = htmlId
  }

  const config = await virtualConfig({root, input, extra, plugins: opts.plugins})
  const {output} = (await build(config)) as RollupOutput
  const html = String((output[0] as OutputAsset).source)

  const outDir = path.resolve(expandHome(opts.outDir ?? "~/.paladin/apps"))
  const outFile = path.join(outDir, `${name}.html`)
  fs.mkdirSync(outDir, {recursive: true})
  fs.writeFileSync(outFile, html)

  if (opts.open ?? true) await openInBrowser(outFile)

  return {outFile, root, usedExisting}
}

type VirtualConfigOpts = {
  /* package root */
  root: string
  /* rollup html input */
  input: string
  /* plugins that must run before everything else (the virtual file server) */
  extra: Plugin[]
  /* see BuildReactAppOpts.plugins */
  plugins?: BuildReactAppOpts["plugins"]
}

/*
 * the package's vite.config (if any) is loaded for its aliases, css, define etc,
 * react comes from it; singlefile is ensured here
 */
async function virtualConfig(o: VirtualConfigOpts): Promise<InlineConfig> {
  const configPath = findViteConfig(o.root)
  const loaded = configPath
    ? await loadConfigFromFile({command: "build", mode: "production"}, configPath, o.root, "warn")
    : null
  const user = loaded?.config ?? {}

  const userPlugins = (await flattenPlugins(user.plugins)).filter(p => p.name !== SINGLEFILE_NAME)

  const plugins: PluginOption[] = [
    ...o.extra,
    ...(o.plugins ? await o.plugins(userPlugins) : userPlugins),
    viteSingleFile(),
  ]

  return {
    ...user,
    root: o.root,
    configFile: false,
    logLevel: "warn",
    // relative urls, nothing should point at an absolute origin
    base: "./",
    plugins,
    build: {
      ...user.build,
      write: false,
      emptyOutDir: false,
      // the preload polyfill fetches urls at runtime, useless once everything is inlined
      modulePreload: false,
      rollupOptions: {
        ...user.build?.rollupOptions,
        input: o.input,
      },
    },
  }
}

async function flattenPlugins(opt: PluginOption | PluginOption[] | undefined): Promise<Plugin[]> {
  const out: Plugin[] = []
  const walk = async (p: unknown): Promise<void> => {
    const v = await p
    if (!v) return
    if (Array.isArray(v)) {
      for (const x of v) await walk(x)
      return
    }
    out.push(v as Plugin)
  }
  await walk(opt)
  return out
}

function virtualMain(entry: string, fromDir: string): string {
  const spec = JSON.stringify(relSpec(fromDir, entry))

  // entries that mount themselves export nothing, so neither default nor App exists and only the side effects run
  return [
    `import {StrictMode} from "react"`,
    `import {createRoot} from "react-dom/client"`,
    `import * as mod from ${spec}`,
    ``,
    `const pick = (key: string) => (mod as any)[key]`,
    `const App = pick("default") ?? pick("App")`,
    `if (App) createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)`,
    ``,
  ].join("\n")
}

function defaultHtml(title: string, mainSrc: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${mainSrc}"></script>
  </body>
</html>
`
}

function virtualFiles(root: string, files: Map<string, string>): Plugin {
  return {
    name: "paladin:virtual-app",
    enforce: "pre",
    resolveId(id) {
      const clean = id.split("?")[0]
      if (files.has(clean)) return clean
      if (clean.startsWith("/")) {
        const abs = path.join(root, clean)
        if (files.has(abs)) return abs
      }
      return null
    },
    load(id) {
      return files.get(id.split("?")[0]) ?? null
    },
  }
}

function findPackageRoot(from: string): string {
  let dir = from
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`no package.json above ${from}`)
    dir = parent
  }
}

function findViteConfig(root: string): string | null {
  for (const n of CONFIG_NAMES) {
    const p = path.join(root, n)
    if (fs.existsSync(p)) return p
  }
  return null
}

function appName(entry: string): string {
  return path.basename(entry).replace(/\.[jt]sx?$/, "").replace(/\.app$/, "")
}

function relSpec(fromDir: string, target: string): string {
  const rel = toPosix(path.relative(fromDir, target))
  return rel.startsWith(".") ? rel : "./" + rel
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p
}

if (import.meta.main) {
  const [entry, name] = process.argv.slice(2)
  if (!entry) {
    console.error("usage: bun build-react-app.ts <entry.tsx> [name]")
    process.exit(1)
  }
  const res = await buildReactApp(entry, {name})
  console.log(res.usedExisting ? "used existing index.html" : "used virtual index.html + main.tsx")
  console.log(res.outFile)
}
