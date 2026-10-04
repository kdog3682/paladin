import { existsSync, readFileSync, realpathSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export const CONFIG_NAMES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cts",
  "vite.config.cjs",
]

/** tried in order when a relative import omits its extension */
export const EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts"]

/** `Button.examples.tsx` — a file of exported example functions rather than an app */
export const isExamples = (path: string) => /\.examples\.[jt]sx?$/.test(path)

/** single-quote a path for `sh -c` */
export const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

/** symlink-stable identity, so a workspace link and its real path compare equal */
export function real(path: string) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** walk up until `marker` is found */
export function findUp(from: string, marker: string) {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, marker))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * walk up looking for any of `names`, stopping after `stop`.
 *
 * bounded because index.html and vite.config live at the project root in a
 * normal app, but one directory up from the app in a nested example or fixture
 * — and we never want to reach past the package into an unrelated project.
 */
export function findUpWithin(from: string, names: string[], stop: string) {
  let dir = from
  for (;;) {
    for (const name of names) {
      const path = join(dir, name)
      if (existsSync(path)) return path
    }
    const parent = dirname(dir)
    if (dir === stop || parent === dir) return null
    dir = parent
  }
}

/** is `name` installed anywhere up the tree — the same walk node's resolver does */
export function findPkg(from: string, name: string) {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, "node_modules", name, "package.json"))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

/** nearest node_modules/.bin/<name> walking upward */
export function findBin(from: string, name: string) {
  let dir = from
  for (;;) {
    const bin = join(dir, "node_modules", ".bin", name)
    if (existsSync(bin)) return bin
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** resolve a relative specifier the way a bundler would, extensions and index files included */
export function resolveModule(from: string, spec: string) {
  const base = resolve(dirname(from), spec)
  const candidates = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, "index" + e)),
  ]
  return candidates.find((c) => existsSync(c)) ?? null
}

/** the workspace packages `project` depends on: name -> real dir outside the project */
function workspaceDeps(project: string) {
  let deps: string[] = []
  try {
    const pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8"))
    deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })
  } catch {}

  const root = real(project)
  const found = new Map<string, string>()
  for (const name of deps) {
    for (let dir = project; ; dir = dirname(dir)) {
      const link = join(dir, "node_modules", name)
      if (existsSync(link)) {
        const target = real(link)
        if (!target.includes("/node_modules/") && !target.startsWith(root + "/")) found.set(name, target)
        break
      }
      if (dirname(dir) === dir) break
    }
  }
  return found
}

/**
 * source dirs of the workspace packages `project` depends on. tailwind skips
 * node_modules and only scans the project, so classes used by a sibling package
 * (which node_modules links to a real path outside the project) get no css.
 */
export function workspaceSources(project: string) {
  const dirs = new Set<string>()
  for (const target of workspaceDeps(project).values()) {
    const src = join(target, "src")
    dirs.add(existsSync(src) ? src : target)
  }
  return [...dirs]
}

/**
 * `<name>/source.css` for each workspace package `project` depends on that
 * exports one: a tailwind entry the package wants compiled into the app's
 * build (theme, base layer, its own @source lines), e.g. @paladin/shadcn.
 */
export function workspaceStyles(project: string) {
  const specs: string[] = []
  for (const [name, target] of workspaceDeps(project)) {
    try {
      const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"))
      if (pkg.exports?.["./source.css"]) specs.push(`${name}/source.css`)
    } catch {}
  }
  return specs
}
