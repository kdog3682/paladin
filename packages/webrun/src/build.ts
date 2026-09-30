import { buildReactApp } from "@paladin/commands/build-react-app"
import { openInBrowser } from "@paladin/utils"
import { existsSync } from "node:fs"
import { rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { plan } from "./detect"
import { BLOCKED_PLUGINS, entrySource, stylesSource } from "./scaffold"
import { readState } from "./state"
import type { Layout } from "./types"

export type WebbuildOpts = {
  /** where the html lands. @default ~/.paladin/apps */
  outDir?: string
  /** output name, before `.html`. @default the path under ~/projects, `/` → `__` */
  name?: string
  /** open the built file when it's written. @default true */
  open?: boolean
}

/** resolved from the project, not from webrun — the build must use the copy the app is written against */
async function projectPlugin(name: string, project: string) {
  const path = Bun.resolveSync(name, project)
  const mod: any = await import(path)
  const factory = mod.default ?? mod
  return typeof factory === "function" ? factory() : factory
}

const pluginName = (p: unknown) => String((p as any)?.name ?? "")

/**
 * the same plugin arithmetic the dev config does (see templates/vite.config.tmpl):
 * drop the test/checker/story plugins riding along in a shared vite.config, and
 * fill in react and tailwind only when the project's own config has not.
 */
function pluginsFor(layout: Layout) {
  return async (user: any[]) => {
    const kept = user.filter((p) => {
      const name = pluginName(p)
      return name !== "" && !BLOCKED_PLUGINS.some((b) => name.includes(b))
    })

    const extra: unknown[] = []
    // two react plugins in one pipeline is a hard error, not a slow build
    if (!kept.some((p) => pluginName(p).startsWith("vite:react"))) {
      extra.push(await projectPlugin("@vitejs/plugin-react", layout.project))
    }
    if (layout.tailwind && !kept.some((p) => pluginName(p).includes("tailwindcss"))) {
      extra.push(await projectPlugin("@tailwindcss/vite", layout.project))
    }
    return [...kept, ...extra] as any[]
  }
}

const PROJECTS = join(homedir(), "projects")

/**
 * the app's path under ~/projects with the separators turned into `__`:
 * `paladin__packages__web2__src__App` for
 * ~/projects/paladin/packages/web2/src/App.tsx.
 *
 * everything in ~/.paladin/apps sits in one flat directory, so the name carries
 * the whole path — nothing is dropped, which is what keeps it unambiguous and
 * reversible. an app outside ~/projects is named from the home directory, or
 * from the root if it lives outside that too.
 */
function outputName(app: string) {
  const under = (base: string) => {
    const rel = relative(base, app)
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : null
  }

  const rel = under(PROJECTS) ?? under(homedir()) ?? app.replace(/^[/\\]+/, "")
  return rel.replace(/\.[jt]sx?$/, "").replace(/\.app$/, "").split(/[/\\]/).join("__")
}

function short(path: string) {
  const rel = relative(process.cwd(), path)
  return rel && !rel.startsWith("..") ? rel : path
}

/**
 * build an app to one self-contained html file, the same way webrun serves it.
 *
 * with no target it builds whatever the last `webrun` call instantiated, which
 * is the point of `--build`: serve, poke at it, then freeze it. the server is
 * neither needed nor touched — the state file is read only for the app path.
 *
 * a project index.html that already mounts this app is used as is. otherwise the
 * generated shell is: a throwaway entry is written *next to the app* (so its
 * relative imports, and the gallery's `?raw` read of it, resolve as they do at
 * dev time), built, and removed. so an `.examples.tsx` target builds its gallery
 * exactly as served, tailwind included.
 */
export async function webbuild(target?: string, opts: WebbuildOpts = {}) {
  const from = target ?? (await readState())?.app
  if (!from) {
    throw new Error("nothing to build — pass an app, or start one first with `webrun <App.tsx>`")
  }

  const app = resolve(from)
  if (!existsSync(app)) throw new Error(`no such app: ${app}`)

  const layout = await plan(app)
  const name = opts.name ?? outputName(app)
  const build = { name, outDir: opts.outDir, open: false, plugins: pluginsFor(layout) }

  const result = layout.mode === "passthrough"
    ? await buildReactApp(app, build)
    : await withShellEntry(layout, app, name, (entry) => buildReactApp(entry, build))

  console.log(`webrun · built ${short(app)}`)
  console.log(`  ${result.outFile}`)
  if (opts.open ?? true) openInBrowser(`file://${result.outFile}`)
  return result
}

/** write the generated entry (and its stylesheet) beside the app, hand it over, then clean up */
async function withShellEntry<T>(layout: Layout, app: string, name: string, use: (entry: string) => Promise<T>) {
  const stem = `__webrun_build__.${name}`
  const dir = dirname(app)
  const entry = join(dir, `${stem}.tsx`)
  const css = join(dir, `${stem}.css`)

  await writeFile(entry, await entrySource(layout, app, dir, layout.tailwind ? `import "./${stem}.css"` : ""))
  if (layout.tailwind) await writeFile(css, await stylesSource(layout))

  try {
    return await use(entry)
  } finally {
    // these sit in the user's source tree, so they go whether the build worked or not
    await rm(entry, { force: true })
    await rm(css, { force: true })
  }
}
