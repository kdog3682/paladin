import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"

export const CONFIG_NAMES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"]

/** `Button.stories.tsx` — a default-exported meta plus one named export per story */
export const STORIES = /\.stories\.[jt]sx?$/
export const isStories = (path: string) => STORIES.test(path)

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"])

export type Plan = {
  /** what was asked for: one stories file, or a directory searched for them */
  target: string
  /** nearest ancestor of the target with a package.json — vite's root */
  project: string
  /** scratch dir for the generated stylesheet and vite's cache */
  workdir: string
  /** the project's own vite config, merged underneath ours */
  userConfig: string | null
  /** `@tailwindcss/vite` is installed, so classes in stories get css */
  tailwind: boolean
  /** paths vite may serve from */
  allow: string[]
  /** workspace package source dirs tailwind has to scan, which it never does on its own */
  sources: string[]
  /** `<pkg>/source.css` entries those packages export */
  styles: string[]
}

export function real(path: string) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** walk up until `marker` is found */
export function findUp(from: string, marker: string) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, marker))) return dir
    if (dirname(dir) === dir) return null
  }
}

/** the nearest `names` file at or above `from`, never reaching past `stop` */
function findUpWithin(from: string, names: string[], stop: string) {
  for (let dir = from; ; dir = dirname(dir)) {
    for (const name of names) if (existsSync(join(dir, name))) return join(dir, name)
    if (dir === stop || dirname(dir) === dir) return null
  }
}

/** is `name` installed anywhere up the tree — the same walk node's resolver does */
export function findPkg(from: string, name: string) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules", name, "package.json"))) return true
    if (dirname(dir) === dir) return false
  }
}

/** nearest node_modules/.bin/<name> walking upward */
export function findBin(from: string, name: string) {
  for (let dir = from; ; dir = dirname(dir)) {
    const bin = join(dir, "node_modules", ".bin", name)
    if (existsSync(bin)) return bin
    if (dirname(dir) === dir) return null
  }
}

/** every stories file at or under `target`, sorted */
export function findStories(target: string) {
  if (!statSync(target).isDirectory()) return [target]
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (isStories(entry.name)) found.push(path)
    }
  }
  walk(target)
  return found.sort()
}

/** `src/components/Button.stories.tsx` -> `components/Button`: where the story lives, when it names no title */
export function titleOf(file: string, project: string) {
  const rel = relative(project, file).replaceAll("\\", "/").replace(STORIES, "")
  return rel.replace(/^(src|lib|app)\//, "")
}

/**
 * the story exports in the order they were written. a module namespace
 * enumerates alphabetically, which would scramble them in the sidebar.
 */
export function exportOrder(file: string) {
  const source = readFileSync(file, "utf8")
  const names = [...source.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function)\s+(\w+)/gm)].map((m) => m[1]!)
  return [...new Set(names)]
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

/** decide where vite roots, what it may serve and what styles the stories need */
export function plan(input: string): Plan {
  const target = resolve(input)
  if (!existsSync(target)) throw new Error(`no such file or directory: ${target}`)
  if (!statSync(target).isDirectory() && !isStories(target)) throw new Error(`not a .stories. file: ${target}`)

  const dir = statSync(target).isDirectory() ? target : dirname(target)
  const project = findUp(dir, "package.json") ?? dir
  const workdir = join(project, "node_modules", ".storylite", Bun.hash(project).toString(36))
  const workspace = findUp(project, ".git")

  const tailwind = findPkg(project, "@tailwindcss/vite")
  const deps = tailwind ? workspaceDeps(project) : new Map<string, string>()
  const sources = [...deps.values()].map((t) => (existsSync(join(t, "src")) ? join(t, "src") : t))
  const styles = [...deps].filter(([, t]) => hasExport(t, "./source.css")).map(([name]) => `${name}/source.css`)

  return {
    target,
    project,
    workdir,
    userConfig: findUpWithin(dir, CONFIG_NAMES, project),
    tailwind,
    allow: [...new Set([project, workdir, dirname(import.meta.dir), workspace].filter(Boolean) as string[])],
    sources,
    styles,
  }
}

function hasExport(pkgDir: string, key: string) {
  try {
    return Boolean(JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).exports?.[key])
  } catch {
    return false
  }
}

/** the generated stylesheet: tailwind, plus the dirs it has to scan for classes */
export function stylesSource(p: Plan) {
  return [
    `@import "tailwindcss";`,
    ...p.styles.map((s) => `@import ${JSON.stringify(s)};`),
    // vite roots at the project but this file lives in node_modules, which tailwind never scans
    `@source ${JSON.stringify(p.project)};`,
    ...p.sources.map((s) => `@source ${JSON.stringify(s)};`),
    "",
  ].join("\n")
}

export const stylesPath = (p: Plan) => join(p.workdir, "styles.css")
export const label = (p: Plan) => basename(p.target)
