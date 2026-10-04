import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { CONFIG_NAMES, findPkg, findUp, findUpWithin, isExamples, real, resolveModule, workspaceSources, workspaceStyles } from "./paths"
import type { Layout, Mode, WebrunOpts } from "./types"

/** the module-type script tags in an index.html, in document order */
function scriptSrcs(html: string) {
  const srcs: string[] = []
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    if (!/type\s*=\s*["']module["']/i.test(tag)) continue
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
    if (src && !/^(https?:)?\/\//.test(src)) srcs.push(src)
  }
  return srcs
}

/** the relative specifiers a module imports (static, side-effect and dynamic) */
function relativeImports(source: string) {
  const specs = new Set<string>()
  const re = /(?:\bfrom\s*|\bimport\s*|\bimport\(\s*)["'](\.[^"']*)["']/g
  for (const m of source.matchAll(re)) specs.add(m[1]!)
  return [...specs]
}

/**
 * does this index.html actually put *this* app on screen?
 *
 * presence of an index.html is not enough: a project always has one, and it
 * normally mounts src/App, not the arbitrary component webrun was handed.
 * running passthrough on a mismatch would silently render the wrong thing —
 * you'd get the dashboard and never know you asked for something else.
 *
 * so we follow entry -> its own relative imports, and stop there. one level is
 * the point, not a shortcut: `main.tsx` importing `App.tsx` means the entry
 * mounts the app, while `App.tsx` importing `Button.tsx` only means the button
 * is reachable. going transitive would make every file in the repo "match".
 */
export async function entryMounts(htmlPath: string, app: string) {
  const target = real(app)
  const html = await readFile(htmlPath, "utf8").catch(() => "")
  if (!html) return false

  for (const src of scriptSrcs(html)) {
    // a leading slash is relative to the html's own dir, which is the vite root
    const spec = src.startsWith("/") ? "." + src : src.startsWith(".") ? src : "./" + src
    const entry = resolveModule(htmlPath, spec)
    if (!entry) continue
    if (real(entry) === target) return true

    const source = await readFile(entry, "utf8").catch(() => "")
    if (!source) continue

    for (const relSpec of relativeImports(source)) {
      const resolved = resolveModule(entry, relSpec)
      if (resolved && real(resolved) === target) return true
    }
  }

  return false
}

/** decide where vite roots and what it may serve */
export async function plan(app: string, opts: WebrunOpts = {}): Promise<Layout> {
  const appDir = dirname(app)
  const project = findUp(appDir, "package.json") ?? appDir
  // keyed by project, not app: every app in a project shares one scratch dir and
  // so one generated config, which is what lets a swap reuse the running server
  const workdir = join(project, "node_modules", ".webrun", Bun.hash(project).toString(36))

  // both live at the project root in a normal app, but a nested example dir may
  // carry its own pair — search up from the app, not down from the package
  const userConfig =
    opts.userConfig === false ? null : findUpWithin(appDir, CONFIG_NAMES, project)
  const htmlPath = findUpWithin(appDir, ["index.html"], project)

  // an examples file is never what a project's index.html mounts, so it always
  // gets the generated gallery shell — whatever was running before it
  const kind = isExamples(app) ? "examples" : "app"

  let mode: Mode = "virtual"
  if (kind === "examples") mode = "virtual"
  else if (opts.mode) mode = opts.mode
  else if (htmlPath && (await entryMounts(htmlPath, app))) mode = "passthrough"

  // passthrough roots at the html's own dir, which is what vite would use
  const root = mode === "passthrough" && htmlPath ? dirname(htmlPath) : workdir

  // the git root catches monorepos: a sibling workspace package resolves through
  // a symlink to a real path outside `project`, which vite would 403 on
  const workspace = findUp(project, ".git")
  // appDir is always inside project, so it is not listed — it would make the
  // config differ per app
  const allow = [...new Set([project, workdir, root, workspace].filter(Boolean) as string[])]

  // gated here rather than in the config, so a project without tailwind never
  // generates an import that would blow the config up on load
  const tailwind = findPkg(project, "@tailwindcss/vite")

  const sources = tailwind ? workspaceSources(project) : []
  const styles = tailwind ? workspaceStyles(project) : []

  return { root, workdir, project, userConfig, allow, tailwind, sources, styles, mode, kind }
}
