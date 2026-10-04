import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { Node } from "ts-morph"
import type { Project } from "ts-morph"
import { gatherPublicExports, getBaseDistance } from "./codemods/gatherPublicExports"
import { createProject, projectRoot } from "./project"
import { getDeclarationsNamed, isExported } from "./utils/declarations"

type Target = {
  /** the barrel file to write, relative to the package */
  barrel: string
  /** names only this target exports, as `name` or `path#name`; other targets leave them out */
  include: string[]
  /** export just the included names directly, and everything else as `export const api = { … }` */
  api?: boolean
}

type BarrelConfig = {
  global: {
    /** names every target exports, whether or not the gatherer found them; `path#name` pins the file (`render/paint#paint`) */
    include: string[]
    /** gathered names no target exports; `path#name` excludes only that file's export */
    exclude: string[]
  }
  targets: Record<string, Target>
}

type Entry = {
  /** the name the declaring file exports it under */
  name: string
  /** the file that declares it */
  file: string
  /** whether it is the declaring file's default export */
  isDefault: boolean
  /** interfaces and type aliases, which can't go in a value like `api` */
  isType: boolean
}

const config: BarrelConfig = {
  global: {
    include: ["render/paint#paint", "viewOf", "serializeScene"],
    exclude: ["Annulus", "AnnularSector", "placeholder", "Frame", "RegularPolygon"],
  },
  targets: {
    node: { barrel: "src/index.ts", include: ["render"] },
    browser: { barrel: "src/browser/index.ts", include: ["ALL_FACES", "preloadFonts"], api: true },
  },
}

const spec = "mathpen/manim"
const dir = projectRoot(spec)

// reused across `bun --hot` reloads
const cache = globalThis as { __project?: Project }
const project = (cache.__project ??= createProject(spec))

const barrelPaths = Object.values(config.targets).map((t) => join(dir, t.barrel))

const gathered: Entry[] = gatherPublicExports(project)
  .filter((e) => !barrelPaths.includes(e.file))
  .map((e) => ({ name: e.name, file: e.file, isDefault: e.isDefault, isType: e.kind === "type" }))

const srcDir = join(dir, "src")

/** strips the extension, a trailing `/index`, and any leading `./` or `src/` */
function normalizePath(path: string) {
  return path
    .replace(/^\.\//, "")
    .replace(/^src\//, "")
    .replace(/\.(tsx?|mts|cts)$/, "")
    .replace(/(^|\/)index$/, "")
}

/** `"render/paint#paint"` -> a name pinned to `src/render/paint.ts`; a bare name matches any file */
function parseItem(item: string): { name: string; path?: string } {
  const at = item.lastIndexOf("#")
  if (at === -1) return { name: item }
  return { name: item.slice(at + 1), path: normalizePath(item.slice(0, at)) }
}

function isInPath(file: string, path: string | undefined) {
  return path === undefined || normalizePath(relative(srcDir, file)) === path
}

/** whether an entry is named by any item of a config list */
function isListed(entry: Entry, items: string[]) {
  return items.some((item) => {
    const { name, path } = parseItem(item)
    return entry.name === name && isInPath(entry.file, path)
  })
}

for (const item of config.global.exclude) {
  if (!gathered.some((e) => isListed(e, [item]))) console.warn(`exclude "${item}": not gathered, nothing to exclude`)
}

/** resolves an include item (`name` or `path#name`) to the one file that declares and exports it */
function findExport(item: string): Entry {
  const { name, path } = parseItem(item)
  const hit = gathered.find((e) => e.name === name && isInPath(e.file, path))
  if (hit) return hit

  const matches = project
    .getSourceFiles()
    .filter((f) => !barrelPaths.includes(f.getFilePath()) && !f.isInNodeModules() && !f.isDeclarationFile())
    .filter((f) => isInPath(f.getFilePath(), path))
    .flatMap((f) => getDeclarationsNamed(f, name).filter(isExported))
  const byFile = Map.groupBy(matches, (n) => n.getSourceFile().getFilePath())
  if (byFile.size === 0) {
    const where = path === undefined ? "" : ` in src/${path}`
    throw new Error(`include "${item}": no exported declaration of ${name}${where}`)
  }

  let [file, nodes] = [...byFile][0]
  if (byFile.size > 1) {
    // same name in several files: keep the one whose signature sits closest to Mobject
    const scored = [...byFile]
      .map(([f, ns]) => ({ file: f, nodes: ns, distance: Math.min(...ns.map((n) => getBaseDistance(n))) }))
      .sort((a, b) => a.distance - b.distance)
    const [best, next] = scored
    if (best.distance === Infinity || best.distance === next.distance) {
      const lines = scored.map((s) => `  ${relative(dir, s.file)} (distance ${s.distance})`)
      throw new Error(
        `include "${item}": declared in ${scored.length} files, none closest to Mobject. ` +
          `Pin one as "path#${name}":\n${lines.join("\n")}`,
      )
    }
    const pinned = `${normalizePath(relative(srcDir, best.file))}#${name}`
    console.warn(`include "${item}": using ${relative(dir, best.file)} (distance ${best.distance}); pin with "${pinned}"`)
    ;({ file, nodes } = best)
  }

  const node = nodes[0]
  const carrier = Node.isVariableDeclaration(node) ? node.getVariableStatement() : node
  return {
    name,
    file,
    isDefault: carrier !== undefined && Node.isExportable(carrier) && carrier.isDefaultExport(),
    isType: Node.isTypeAliasDeclaration(node) || Node.isInterfaceDeclaration(node),
  }
}

/** `src/mobject/frame.ts` from `src/browser/index.ts` -> `../mobject/frame` */
function toSpecifier(barrel: string, file: string) {
  const rel = relative(dirname(barrel), file).replace(/\.(tsx?|mts|cts)$/, "").replace(/\/index$/, "")
  return rel.startsWith(".") ? rel : `./${rel}`
}

function braces(items: string[]) {
  if (items.length === 1) return `{ ${items[0]} }`
  return `{\n${items.map((i) => `\t${i},`).join("\n")}\n}`
}

/** one `export { … } from` or `import { … } from` per declaring file */
function statements(keyword: "export" | "import", entries: Entry[], barrel: string) {
  const byFile = Map.groupBy(entries, (e) => toSpecifier(barrel, e.file))
  return [...byFile]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([specifier, group]) => {
      const items = group
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((e) => `${e.isType ? "type " : ""}${e.isDefault ? `default as ${e.name}` : e.name}`)
      return `${keyword} ${braces(items)} from "${specifier}"`
    })
}

function dedupe(entries: Entry[]) {
  const seen = new Map<string, Entry>()
  for (const e of entries) seen.set(`${e.file}#${e.name}`, e)
  return [...seen.values()]
}

/** two files exporting the same name would collide in one barrel */
function assertUniqueNames(entries: Entry[], barrel: string) {
  const byName = Map.groupBy(entries, (e) => e.name)
  const clashes = [...byName].filter(([, group]) => group.length > 1)
  if (clashes.length === 0) return
  const lines = clashes.map(([name, group]) => `  ${name}: ${group.map((e) => relative(dir, e.file)).join(", ")}`)
  throw new Error(`${relative(dir, barrel)}: names exported from more than one file\n${lines.join("\n")}`)
}

for (const [key, target] of Object.entries(config.targets)) {
  const barrel = join(dir, target.barrel)
  const own = [...config.global.include, ...target.include]
  const otherTargets = Object.entries(config.targets).flatMap(([k, t]) => (k === key ? [] : t.include))

  const included = dedupe(own.map(findExport))
  // an included name displaces every gathered export of that name, so a pinned
  // `render/paint#paint` doesn't clash with the gathered `grid/paint`
  const ownNames = new Set(included.map((e) => e.name))
  const rest = dedupe(
    gathered.filter(
      (e) => !ownNames.has(e.name) && !isListed(e, config.global.exclude) && !isListed(e, otherTargets),
    ),
  )

  let text: string
  if (target.api) {
    const values = rest.filter((e) => !e.isType)
    const dropped = rest.length - values.length
    if (dropped > 0) console.warn(`${target.barrel}: ${dropped} type exports left out of api`)
    assertUniqueNames([...included, ...values], barrel)

    text = [
      ...statements("import", values, barrel),
      "",
      ...statements("export", included, barrel),
      "",
      `export const api = ${braces(values.map((e) => e.name).sort((a, b) => a.localeCompare(b)))}`,
    ].join("\n")
  } else {
    const entries = [...included, ...rest]
    assertUniqueNames(entries, barrel)
    text = statements("export", entries, barrel).join("\n")
  }

  mkdirSync(dirname(barrel), { recursive: true })
  writeFileSync(barrel, `${text}\n`)
  console.log(`${key}: wrote ${target.barrel} (${included.length} included, ${rest.length} gathered)`)
}
