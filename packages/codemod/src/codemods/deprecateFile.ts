import path from "node:path"
import { Node } from "ts-morph"
import type { ExportDeclaration, Identifier, ImportDeclaration, Project, SourceFile } from "ts-morph"
import { contains } from "../utils/references"

type DeprecateFileResult = {
  /** the deprecated file and every file deleted along with it */
  deleted: string[]
  /** files that had imports or re-exports commented out */
  patched: string[]
}

type TextEdit = {
  /** position the replaced range starts at */
  start: number
  /** position the replaced range ends at (exclusive) */
  end: number
  /** the text that takes its place */
  text: string
}

/** what a file loses when a module it points at shrinks or disappears */
type Loss = {
  /** statement -> the parts of it that no longer resolve (the statement itself when it goes whole) */
  parts: Map<Node, Set<Node>>
  /** real uses of the lost bindings, outside of imports and re-exports */
  uses: Node[]
  /** whether the file forwards the (still existing) module wholesale with `export *` */
  forwards: boolean
}

/**
 * Deletes a file and everything built on it. The file is given as a file name (`recipe.ts`),
 * a partial path (`layout/recipe.ts`) or an absolute path, and may already be gone from disk.
 * - files that use it are deleted
 * - barrels (files of nothing but imports/exports) in the deprecated file's directory are
 *   deleted, since they belong to the same group
 * - other barrels, and files that only import or re-export it without using it, get the
 *   affected imports and exports commented out, splitting mixed declarations
 * Anything deleted or whose exports shrink is processed the same way in turn.
 */
export function deprecateFile(project: Project, file: string): DeprecateFileResult {
  const target = resolveTarget(project, file)
  const directory = path.posix.dirname(target)
  project.getSourceFile(target)?.delete()

  const deleted = new Set([target])
  const patched = new Set<string>()
  const forwarded = new Set<string>()
  const queue = [target]
  const enqueue = (filePath: string) => {
    if (!queue.includes(filePath)) queue.push(filePath)
  }
  const remove = (file: SourceFile) => {
    const filePath = file.getFilePath()
    file.delete()
    deleted.add(filePath)
    enqueue(filePath)
  }

  while (queue.length) {
    const changed = queue.shift()!
    const exports = getExportNames(project, changed)

    for (const file of project.getSourceFiles()) {
      const filePath = file.getFilePath()
      if (file.wasForgotten() || filePath === changed) continue
      const loss = getLoss(file, changed, exports)

      // `export * from` a module that shrank: this file's surface shrank too
      const edge = `${filePath}<-${changed}`
      if (loss.forwards && !forwarded.has(edge)) {
        forwarded.add(edge)
        enqueue(filePath)
      }

      if (isBarrel(file)) {
        if (!loss.parts.size) continue
        if (path.posix.dirname(filePath) === directory) {
          remove(file)
          continue
        }
      } else if (loss.uses.length) {
        remove(file)
        continue
      }
      if (!loss.parts.size) continue

      const exportsChanged = [...loss.parts.keys()].some((statement) => !Node.isImportDeclaration(statement))
      applyTextEdits(file, [...loss.parts].map(([statement, parts]) => commentOutParts(statement, parts)))
      patched.add(filePath)
      if (exportsChanged) enqueue(filePath)
    }
  }

  return { deleted: [...deleted], patched: [...patched].filter((p) => !deleted.has(p)) }
}

const EXTENSION = /\.(d\.)?[cm]?[jt]sx?$/

function stripExtension(filePath: string) {
  return filePath.replace(EXTENSION, "")
}

function normalizeModulePath(filePath: string) {
  return stripExtension(filePath).replace(/\/index$/, "")
}

/** the absolute path a relative module specifier points at, whether or not it exists */
function resolveSpecifier(declaration: ImportDeclaration | ExportDeclaration): string | undefined {
  const specifier = declaration.getModuleSpecifierValue()
  if (!specifier?.startsWith(".")) return undefined
  return path.posix.resolve(path.posix.dirname(declaration.getSourceFile().getFilePath()), specifier)
}

function pointsAt(declaration: ImportDeclaration | ExportDeclaration, filePath: string): boolean {
  const resolved = resolveSpecifier(declaration)
  return resolved !== undefined && normalizeModulePath(resolved) === normalizeModulePath(filePath)
}

/**
 * Resolves a file name, partial path or absolute path to one file: a source file of the
 * project, or failing that the path relative imports point at (the file may be gone already).
 */
function resolveTarget(project: Project, name: string): string {
  const wanted = stripExtension(name.replace(/^\.\//, ""))
  const matches = (filePath: string) =>
    path.posix.isAbsolute(name) ? stripExtension(filePath) === wanted : stripExtension(filePath).endsWith(`/${wanted}`)

  const candidates = new Set(project.getSourceFiles().map((f) => f.getFilePath()).filter(matches))
  if (!candidates.size)
    for (const file of project.getSourceFiles())
      for (const decl of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
        const resolved = resolveSpecifier(decl)
        if (resolved && matches(resolved)) candidates.add(stripExtension(resolved))
      }

  if (candidates.size === 1) return [...candidates][0]
  throw new Error(
    candidates.size
      ? `"${name}" is ambiguous: ${[...candidates].join(", ")}`
      : `"${name}" matches no file in the project`,
  )
}

/** the names a file exports, or undefined when the file is gone */
function getExportNames(project: Project, filePath: string): Set<string> | undefined {
  const file = project.getSourceFile(filePath)
  return file && new Set(file.getExportedDeclarations().keys())
}

function getLoss(file: SourceFile, target: string, exports: Set<string> | undefined): Loss {
  const loss: Loss = { parts: new Map(), uses: [], forwards: false }
  const gone = (name: string) => !exports?.has(name)
  const lose = (statement: Node, part: Node = statement) => {
    const parts = loss.parts.get(statement) ?? new Set()
    parts.add(part)
    loss.parts.set(statement, parts)
  }
  const locals: Identifier[] = []
  const uses: Node[] = []

  for (const decl of file.getImportDeclarations()) {
    if (!pointsAt(decl, target)) continue
    const def = decl.getDefaultImport()
    const ns = decl.getNamespaceImport()
    const named = decl.getNamedImports()

    // side-effect import
    if (!def && !ns && !named.length && !exports) lose(decl)
    if (def && gone("default")) {
      lose(decl, def)
      locals.push(def)
    }
    if (ns && !exports) {
      lose(decl, ns)
      locals.push(ns)
    } else if (ns) {
      // the namespace survives, only its lost members count as uses
      uses.push(...getLostMembers(ns, gone))
    }
    for (const spec of named) {
      if (!gone(spec.getName())) continue
      lose(decl, spec)
      const local = spec.getAliasNode() ?? spec.getNameNode()
      if (Node.isIdentifier(local)) locals.push(local)
    }
  }

  for (const decl of file.getExportDeclarations()) {
    if (!decl.hasModuleSpecifier() || !pointsAt(decl, target)) continue
    const named = decl.getNamedExports()
    if (!named.length) {
      if (exports) loss.forwards = true
      else lose(decl)
    }
    for (const spec of named) if (gone(spec.getName())) lose(decl, spec)
  }

  // local re-exports of a lost binding: `export { a }`, `export default a`
  const names = new Set(locals.map((local) => local.getText()))
  for (const decl of file.getExportDeclarations()) {
    if (decl.hasModuleSpecifier()) continue
    for (const spec of decl.getNamedExports()) if (names.has(spec.getName())) lose(decl, spec)
  }
  for (const assignment of file.getExportAssignments()) {
    const expression = assignment.getExpression()
    if (Node.isIdentifier(expression) && names.has(expression.getText())) lose(assignment)
  }

  for (const local of locals) uses.push(...local.findReferencesAsNodes())
  const moduleStatements = file.getStatements().filter(isModuleStatement)
  loss.uses = uses.filter(
    (use) => use.getSourceFile() === file && !moduleStatements.some((statement) => contains(statement, use)),
  )
  return loss
}

/** `ns.X` / `ns.X` type uses of a namespace import whose member is gone */
function getLostMembers(namespace: Identifier, gone: (name: string) => boolean): Node[] {
  return namespace.findReferencesAsNodes().flatMap((ref) => {
    const parent = ref.getParent()
    if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === ref && gone(parent.getName())) return [parent]
    if (Node.isQualifiedName(parent) && parent.getLeft() === ref && gone(parent.getRight().getText())) return [parent]
    return []
  })
}

function isModuleStatement(node: Node) {
  return Node.isImportDeclaration(node) || Node.isExportDeclaration(node) || Node.isExportAssignment(node)
}

function isBarrel(file: SourceFile) {
  return file.getStatements().every(isModuleStatement)
}

/** the bindings a statement is made of, or the statement itself when it can only go whole */
function getParts(statement: Node): Node[] {
  if (Node.isImportDeclaration(statement))
    return [statement.getDefaultImport(), statement.getNamespaceImport(), ...statement.getNamedImports()]
      .filter((part): part is NonNullable<typeof part> => part !== undefined)
  if (Node.isExportDeclaration(statement) && statement.getNamedExports().length) return statement.getNamedExports()
  return [statement]
}

function commentOut(text: string) {
  return text.split("\n").map((line) => `// ${line}`).join("\n")
}

function commentOutParts(statement: Node, lost: Set<Node>): TextEdit {
  const kept = getParts(statement).filter((part) => !lost.has(part))
  if (!kept.length)
    return { start: statement.getStart(true), end: statement.getEnd(), text: commentOut(statement.getText(true)) }

  const removed = [...lost].sort((a, b) => a.getStart() - b.getStart())
  const decl = statement as ImportDeclaration | ExportDeclaration
  return {
    start: statement.getStart(),
    end: statement.getEnd(),
    text: `${print(decl, kept)}\n${commentOut(print(decl, removed))}`,
  }
}

/** prints an import/export declaration carrying only some of its bindings */
function print(decl: ImportDeclaration | ExportDeclaration, parts: Node[]): string {
  const semi = decl.getText().endsWith(";") ? ";" : ""
  const type = decl.isTypeOnly() ? "type " : ""

  if (Node.isImportDeclaration(decl)) {
    const named = parts.filter(Node.isImportSpecifier)
    const heads = parts
      .filter((part) => !Node.isImportSpecifier(part))
      .map((part) => (part === decl.getNamespaceImport() ? `* as ${part.getText()}` : part.getText()))
    if (named.length) heads.push(`{ ${named.map((spec) => spec.getText()).join(", ")} }`)
    return `import ${type}${heads.join(", ")} from ${decl.getModuleSpecifier().getText()}${semi}`
  }

  const from = decl.getModuleSpecifier()
  const specs = parts.map((spec) => spec.getText()).join(", ")
  return `export ${type}{ ${specs} }${from ? ` from ${from.getText()}` : ""}${semi}`
}

/**
 * Applies edits to the file text back to front, then swaps in the whole text at once.
 * Replacing ranges in place makes ts-morph try to match old nodes to new ones, which fails
 * when a statement turns into a statement plus a comment.
 */
function applyTextEdits(file: SourceFile, edits: TextEdit[]) {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let text = file.getFullText()
  let previousStart = Infinity
  for (const edit of sorted) {
    if (edit.end > previousStart) throw new Error(`overlapping edits in ${file.getFilePath()}`)
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
    previousStart = edit.start
  }
  file.getProject().createSourceFile(file.getFilePath(), text, { overwrite: true })
}
