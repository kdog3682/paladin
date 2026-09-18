import { dirname, isAbsolute, join, relative } from "node:path"
import { type ExportDeclaration, type ImportDeclaration, Node, type Project, type SourceFile, SyntaxKind } from "ts-morph"
import { addNamedImport } from "../utils/imports"

/*
  A file importing its own package by bare name, e.g. inside @mathpen/manim:

    import { CGroup } from "@mathpen/manim"

  resolves through the package's exports map to its public entry
  (node/index.ts -> browser/api.ts -> grid/table.ts -> grid/grid.ts), dragging the
  whole public API into the load order and creating cycles like

    grid.ts -> defaults.ts -> markup -> math/expr -> "@mathpen/manim" -> ... -> table.ts -> grid.ts

  where `class Table extends Grid` throws the TDZ ReferenceError.

  This rewrites every such self-import (and `export … from`) into relative imports
  pointing straight at the file that declares each symbol:

    import { CGroup } from "../../mobject/cobject"

  The declaring file is never guessed by name. The specifier is resolved the way
  the runtime does (package.json `exports`, node conditions) and the name is
  followed through that entry's re-exports, so the result is exactly the binding
  the bare import used to produce. The package may declare the same name in
  several files (Line in geometry/line.ts and markup/layout.ts); that doesn't
  matter, because only the one the public entry exports is picked.
*/

type Manifest = {
  name?: string
  exports?: unknown
  main?: string
  module?: string
}

type PackageInfo = {
  /* the directory holding the package.json */
  dir: string
  /* the `name` field of the package.json */
  name: string
  /* the parsed package.json, used to resolve self-references through `exports` */
  manifest: Manifest
}

type ExportSource = {
  /* the file that actually declares the export */
  file: SourceFile
  /* the name it is exported under in that file (`default` for default exports) */
  name: string
}

type Binding = {
  /* the name imported from the package (`default` for a default import) */
  name: string
  /* the local name the file uses */
  local: string
  /* the whole declaration is `import type` */
  isTypeOnly: boolean
  /* just this specifier is `type X` */
  inlineType: boolean
}

/* the conditions a bun/node runtime matches in an `exports` map, in object key order */
const CONDITIONS = new Set(["bun", "node", "import", "require", "default"])

export function relativizeSelfImports(project: Project) {
  const packages = new Map<string, PackageInfo | undefined>()

  for (const file of project.getSourceFiles()) {
    if (file.isDeclarationFile() || file.isInNodeModules()) continue
    const pkg = getOwningPackage(file, packages)
    if (!pkg) continue

    const imports = file.getImportDeclarations()
      .filter(decl => isSelfReference(decl.getModuleSpecifierValue(), pkg))
    const exports = file.getExportDeclarations()
      .filter(decl => isSelfReference(decl.getModuleSpecifierValue() ?? "", pkg))

    for (const decl of imports) rewriteImport(decl, pkg)
    for (const decl of exports) rewriteExport(decl, pkg)
  }
}

function rewriteImport(decl: ImportDeclaration, pkg: PackageInfo) {
  const file = decl.getSourceFile()
  if (decl.getNamespaceImport()) return warn(decl, "namespace import, rewrite by hand")

  const bindings: Binding[] = []
  const defaultImport = decl.getDefaultImport()
  if (defaultImport) {
    bindings.push({ name: "default", local: defaultImport.getText(), isTypeOnly: decl.isTypeOnly(), inlineType: false })
  }
  for (const specifier of decl.getNamedImports()) {
    bindings.push({
      name: specifier.getName(),
      local: specifier.getAliasNode()?.getText() ?? specifier.getName(),
      isTypeOnly: decl.isTypeOnly(),
      inlineType: specifier.isTypeOnly(),
    })
  }
  if (!bindings.length) return warn(decl, "side-effect import of the package itself, rewrite by hand")

  const sources = locateAll(decl, bindings.map(b => b.name), pkg)
  if (!sources) return

  bindings.forEach((binding, i) => {
    const source = sources[i]!
    // inserting at the old declaration's index keeps the new imports in its place, in order
    const index = decl.getChildIndex()
    if (source.name === "default") {
      file.insertImportDeclaration(index, {
        defaultImport: binding.local,
        moduleSpecifier: file.getRelativePathAsModuleSpecifierTo(source.file),
        isTypeOnly: binding.isTypeOnly,
      })
      return
    }
    const alias = binding.local === source.name ? undefined : binding.local
    addNamedImport(file, source.file, source.name, {
      alias,
      isTypeOnly: binding.isTypeOnly,
      inlineType: binding.inlineType,
      insertIndex: index,
    })
  })
  decl.remove()
}

function rewriteExport(decl: ExportDeclaration, pkg: PackageInfo) {
  const file = decl.getSourceFile()
  const specifiers = decl.getNamedExports()
  if (!specifiers.length) return warn(decl, "`export *` from the package itself, rewrite by hand")

  const sources = locateAll(decl, specifiers.map(s => s.getName()), pkg)
  if (!sources) return

  // group by declaring file so each target gets a single `export { … } from`
  const groups = new Map<SourceFile, { name: string, alias?: string }[]>()
  specifiers.forEach((specifier, i) => {
    const source = sources[i]!
    const exposed = specifier.getAliasNode()?.getText() ?? specifier.getName()
    const group = groups.get(source.file) ?? []
    group.push({ name: source.name, alias: exposed === source.name ? undefined : exposed })
    groups.set(source.file, group)
  })

  for (const [target, namedExports] of groups) {
    const inserted = file.insertExportDeclaration(decl.getChildIndex(), {
      moduleSpecifier: file.getRelativePathAsModuleSpecifierTo(target),
      namedExports,
      isTypeOnly: decl.isTypeOnly(),
    })
    inserted.getLastChildByKind(SyntaxKind.SemicolonToken)?.replaceWithText("")
  }
  decl.remove()
}

/* resolves every name or none, so a declaration is never half rewritten */
function locateAll(decl: ImportDeclaration | ExportDeclaration, names: string[], pkg: PackageInfo) {
  const results = names.map(name => locate(decl, name, pkg))
  const problems = results.filter((result): result is string => typeof result === "string")
  if (problems.length) {
    for (const problem of problems) warn(decl, `${problem}, left as is`)
    return
  }
  return results as ExportSource[]
}

/*
  the declaring file of a name, or the reason it can't be determined:
    1. whatever the package entry the specifier resolves to exports under that name
    2. otherwise every file of the package that declares and exports that name
    3. several candidates left: the one the importing file's usage type-checks against
*/
function locate(decl: ImportDeclaration | ExportDeclaration, name: string, pkg: PackageInfo): ExportSource | string {
  const self = decl.getSourceFile()
  const specifier = decl.getModuleSpecifierValue()!
  const entry = resolveSelfReference(decl.getProject(), pkg, specifier) ?? resolvedByTypeScript(decl, pkg)

  const viaEntry = entry ? sourcesOf(entry, name) : []
  const candidates = (viaEntry.length ? viaEntry : packageCandidates(decl, name, pkg))
    .filter(source => isInPackage(source.file, pkg) && source.file !== self)

  if (candidates.length === 1) return candidates[0]!
  if (!candidates.length) return `no file of ${pkg.name} declares and exports ${name}`
  if (!Node.isImportDeclaration(decl)) {
    return `${name} is declared in ${candidates.map(c => rel(c.file)).join(", ")} and a re-export has no usage to tell them apart`
  }
  return pickByUsage(decl, name, candidates)
}

/* one source per distinct file declaring what a module exports under a name */
function sourcesOf(module: SourceFile, name: string): ExportSource[] {
  const sources = new Map<SourceFile, ExportSource>()
  for (const declaration of module.getExportedDeclarations().get(name) ?? []) {
    const file = declaration.getSourceFile()
    if (sources.has(file)) continue
    const exported = file.getExportedDeclarations()
    const exportName = exported.get(name)?.includes(declaration)
      ? name
      : [...exported].find(([, nodes]) => nodes.includes(declaration))?.[0]
    if (exportName) sources.set(file, { file, name: exportName })
  }
  return [...sources.values()]
}

/* files of the package declaring (not re-exporting) the name themselves */
function packageCandidates(decl: ImportDeclaration | ExportDeclaration, name: string, pkg: PackageInfo) {
  if (name === "default") return []
  return decl.getProject().getSourceFiles()
    .filter(file => isInPackage(file, pkg))
    .flatMap(file => sourcesOf(file, name).filter(source => source.file === file))
}

/*
  imports each candidate into a scratch copy of the importing file and keeps the one
  producing the fewest type errors. Candidates tied on errors with identical
  declarations (the same `type Vect3 = [number, number, number]` pasted in several
  files) are interchangeable, so the one the package imports most wins.
*/
function pickByUsage(decl: ImportDeclaration, name: string, candidates: ExportSource[]): ExportSource | string {
  const scored = candidates.map(candidate => ({ candidate, errors: countErrorsWith(decl, name, candidate) }))
  const fewest = Math.min(...scored.map(s => s.errors))
  const winners = scored.filter(s => s.errors === fewest).map(s => s.candidate)
  const summary = scored.map(s => `${rel(s.candidate.file)}: ${s.errors} error(s)`).join(", ")

  if (winners.length === 1) {
    warn(decl, `${name} picked ${rel(winners[0]!.file)} by usage (${summary})`)
    return winners[0]!
  }

  const shapes = new Set(winners.map(w => declarationShape(w, name)))
  if (shapes.size === 1) {
    const ranked = winners
      .map(w => ({ w, uses: w.file.getReferencingSourceFiles().length }))
      .sort((a, b) => b.uses - a.uses)
    if (ranked[0]!.uses !== ranked[1]!.uses) {
      warn(decl, `${name} is identical in ${winners.map(w => rel(w.file)).join(", ")}, picked the most imported ${rel(ranked[0]!.w.file)}`)
      return ranked[0]!.w
    }
  }
  return `${name} type-checks equally against several files (${summary})`
}

function countErrorsWith(decl: ImportDeclaration, name: string, candidate: ExportSource) {
  const file = decl.getSourceFile()
  const project = file.getProject()
  const typeKeyword = decl.isTypeOnly() ? "type " : ""
  const specifier = decl.getNamedImports().find(s => s.getName() === name)
  const local = name === "default"
    ? decl.getDefaultImport()!.getText()
    : specifier?.getAliasNode()?.getText() ?? name

  // the probed binding, pointed at the candidate
  const target = file.getRelativePathAsModuleSpecifierTo(candidate.file)
  const inlineType = specifier?.isTypeOnly() ? "type " : ""
  const binding = candidate.name === local ? local : `${candidate.name} as ${local}`
  const lines = [
    candidate.name === "default"
      ? `import ${typeKeyword}${local} from "${target}"`
      : `import ${typeKeyword}{ ${inlineType}${binding} } from "${target}"`,
  ]

  // every other binding of the declaration, left as it was
  const defaultImport = name === "default" ? undefined : decl.getDefaultImport()?.getText()
  const rest = decl.getNamedImports().filter(s => s !== specifier).map(s => s.getText())
  const others = [defaultImport, rest.length ? `{ ${rest.join(", ")} }` : undefined].filter(Boolean)
  if (others.length) lines.push(`import ${typeKeyword}${others.join(", ")} from "${decl.getModuleSpecifierValue()}"`)

  const text = file.getFullText()
  const probeText = text.slice(0, decl.getStart()) + lines.join("\n") + text.slice(decl.getEnd())
  // same directory, so relative specifiers in the copy resolve exactly as in the original
  const probePath = join(file.getDirectoryPath(), `__probe__${file.getBaseName()}`)
  const probe = project.createSourceFile(probePath, probeText, { overwrite: true })
  try {
    return probe.getPreEmitDiagnostics().length
  } finally {
    project.removeSourceFile(probe)
  }
}

/* the declaration text with export modifiers and whitespace ignored, to spot copy-pasted duplicates */
function declarationShape(source: ExportSource, name: string) {
  const declarations = source.file.getExportedDeclarations().get(source.name) ?? []
  const texts = declarations
    .filter(d => d.getSourceFile() === source.file)
    .map(d => (Node.isVariableDeclaration(d) ? d.getVariableStatement() ?? d : d).getText())
    .map(text => text.replace(/\bexport\s+(default\s+)?/g, "").replace(/\s+/g, " ").trim())
  return `${name}:${[...new Set(texts)].sort().join("|")}`
}

/* resolves `pkg` / `pkg/sub` through the manifest's `exports` (or main/module) to a source file */
function resolveSelfReference(project: Project, pkg: PackageInfo, specifier: string) {
  const subpath = `.${specifier.slice(pkg.name.length)}`
  const target = matchSubpath(pkg.manifest, subpath)
  return target ? findSourceFile(project, join(pkg.dir, target)) : undefined
}

function matchSubpath(manifest: Manifest, subpath: string): string | undefined {
  const { exports } = manifest
  if (exports === undefined) return subpath === "." ? manifest.module ?? manifest.main : undefined

  const isSubpathMap = typeof exports === "object" && exports !== null && !Array.isArray(exports)
    && Object.keys(exports).some(key => key.startsWith("."))
  const map = (isSubpathMap ? exports : { ".": exports }) as Record<string, unknown>

  if (subpath in map) return pickTarget(map[subpath])
  for (const [key, value] of Object.entries(map)) {
    const star = key.indexOf("*")
    if (star < 0) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    const fits = subpath.startsWith(prefix) && subpath.endsWith(suffix)
      && subpath.length >= prefix.length + suffix.length
    if (!fits) continue
    const match = subpath.slice(prefix.length, subpath.length - suffix.length)
    return pickTarget(value)?.replaceAll("*", match)
  }
}

/* walks a conditional target the way node does: first matching condition in key order */
function pickTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = pickTarget(item)
      if (target) return target
    }
    return
  }
  if (value && typeof value === "object") {
    for (const [condition, nested] of Object.entries(value)) {
      if (!CONDITIONS.has(condition)) continue
      const target = pickTarget(nested)
      if (target) return target
    }
  }
}

/* maps a resolved path to project source, accepting `.js` targets that sit next to `.ts` sources */
function findSourceFile(project: Project, path: string) {
  const stem = path.replace(/\.[mc]?js$/, "")
  const candidates = [path, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, join(path, "index.ts")]
  for (const candidate of candidates) {
    const file = project.getSourceFile(candidate) ?? project.addSourceFileAtPathIfExists(candidate)
    if (file && !file.isDeclarationFile()) return file
  }
}

/* what the compiler resolved the specifier to, when that is source of this package */
function resolvedByTypeScript(decl: ImportDeclaration | ExportDeclaration, pkg: PackageInfo) {
  const file = decl.getModuleSpecifierSourceFile()
  return file && isInPackage(file, pkg) ? file : undefined
}

/* the manifest text: a package.json held by the project (unsaved, e.g. in-memory) or else on the fs */
function readManifest(project: Project, path: string) {
  const held = project.getSourceFile(path)
  if (held) return held.getFullText()
  const fs = project.getFileSystem()
  return fs.fileExistsSync(path) ? fs.readFileSync(path) : undefined
}

/* the nearest package.json above the file that has a name */
function getOwningPackage(file: SourceFile, cache: Map<string, PackageInfo | undefined>) {
  const project = file.getProject()
  const visited: string[] = []
  let dir = file.getDirectoryPath()
  let found: PackageInfo | undefined

  while (true) {
    if (cache.has(dir)) {
      found = cache.get(dir)
      break
    }
    visited.push(dir)
    const path = join(dir, "package.json")
    const text = readManifest(project, path)
    if (text !== undefined) {
      const manifest = JSON.parse(text) as Manifest
      if (manifest.name) {
        found = { dir, name: manifest.name, manifest }
        break
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const dir of visited) cache.set(dir, found)
  return found
}

function isSelfReference(specifier: string, pkg: PackageInfo) {
  return specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)
}

function isInPackage(file: SourceFile, pkg: PackageInfo) {
  const fromPackage = relative(pkg.dir, file.getFilePath())
  return !file.isDeclarationFile() && !fromPackage.startsWith("..") && !isAbsolute(fromPackage)
}

function rel(file: SourceFile) {
  return relative(process.cwd(), file.getFilePath())
}

function warn(node: Node, message: string) {
  console.warn(`${rel(node.getSourceFile())}:${node.getStartLineNumber()} ${message}`)
}
