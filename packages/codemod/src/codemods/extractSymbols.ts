import { dirname, relative, resolve } from "node:path"
import {
  Node,
  SyntaxKind,
  ts,
  type ExportDeclaration,
  type ExportSpecifier,
  type Identifier,
  type ImportDeclaration,
  type Project,
  type SourceFile,
} from "ts-morph"
import { getDeclarationsNamed, isExported } from "../utils/declarations"
import { resolveModuleFile } from "../utils/modules"
import { isMemberName } from "../utils/nodes"

export type ExtractItem = {
  /** path of the file the symbols live in, resolved against root */
  file: string
  /** module-scope declarations of the file, or names it exports (`default` included) */
  symbols: string[]
}

export type ExtractOpts = {
  /** directory item paths and relative external imports resolve against. defaults to cwd */
  root?: string
}

/** a module-scope name of a file: `path\0name`, with `default` and `*` for the anonymous ones */
type Key = string

/** an import of something outside the project, shared by every file that imports it */
type External = {
  /** the name it goes by in the output */
  name: string
  /** stays true only while every import of it is type-only */
  typeOnly: boolean
}

type ExternalModule = {
  default?: External
  namespace?: External
  named: Map<string, External>
}

/** what a name ends up referring to in the output */
type Target = { kind: "local"; key: Key } | { kind: "external"; ref: External }

/** an object standing in for a project module that is imported as a namespace and used whole */
type NamespaceObject = {
  key: Key
  /** exported name -> what it refers to */
  entries: [string, Target][]
}

type Edit = { start: number; end: number; text: string }

/**
 * Collects the given symbols and everything they depend on, across files, into a single
 * module. Imports of anything outside the project are merged at the top, one line per module.
 * Imports between project files disappear, since the code they point at is inlined. Inlined
 * declarations are renamed where an alias, a default import, or a name clash calls for it.
 * Declarations are ordered after their dependencies. Comments are dropped, and so is `export`,
 * except on the requested symbols. Files are added to the project only as imports lead to them.
 */
export function extractSymbols(
  project: Project,
  items: ExtractItem[],
  opts: ExtractOpts = {},
): string {
  const root = resolve(opts.root ?? process.cwd())
  /** output name of every local key */
  const names = new Map<Key, string>()
  const taken = new Set<string>()
  /** the statements that declare each local key */
  const keyStatements = new Map<Key, Node[]>()
  const included = new Set<Node>()
  /** requested statements, which keep their export modifiers */
  const kept = new Set<Node>()
  /** statements after their dependencies */
  const order: (Node | NamespaceObject)[] = []
  const externals = new Map<string, ExternalModule>()
  /** `null` while a lookup is in progress, to break cycles */
  const exportCache = new Map<Key, Target | null>()
  const moduleCache = new Map<Node, SourceFile | undefined>()

  const keyOf = (file: SourceFile, name: string): Key => `${file.getFilePath()}\0${name}`

  const unique = (preferred: string) => {
    let name = preferred
    for (let i = 2; taken.has(name); i++) name = `${preferred}${i}`
    taken.add(name)
    return name
  }

  const claim = (key: Key, preferred: string, statement?: Node) => {
    if (statement) keyStatements.set(key, [...(keyStatements.get(key) ?? []), statement])
    if (!names.has(key)) names.set(key, unique(preferred))
  }

  const nameOf = (target: Target) =>
    target.kind === "external" ? target.ref.name : (names.get(target.key) ?? target.key.split("\0")[1])

  const isValue = (target: Target) =>
    target.kind === "external"
      ? !target.ref.typeOnly
      : !(keyStatements.get(target.key)?.every(isTypeDeclaration) ?? false)

  const moduleOf = (declaration: ImportDeclaration | ExportDeclaration) => {
    if (!moduleCache.has(declaration)) {
      const specifier = declaration.getModuleSpecifierValue()
      const file = declaration.getSourceFile()
      moduleCache.set(
        declaration,
        specifier === undefined ? undefined : resolveModuleFile(project, file, specifier),
      )
    }
    return moduleCache.get(declaration)
  }

  /** the specifier an external import is written with in the output, relative ones rebased onto root */
  const externalSpecifier = (declaration: ImportDeclaration | ExportDeclaration) => {
    const specifier = declaration.getModuleSpecifierValue()!
    if (!specifier.startsWith(".")) return specifier
    const from = dirname(declaration.getSourceFile().getFilePath())
    const path = relative(root, resolve(from, specifier)).replaceAll("\\", "/")
    return path.startsWith(".") ? path : `./${path}`
  }

  function registerExternal(
    specifier: string,
    importedName: string,
    preferred: string,
    typeOnly: boolean,
  ): Target {
    let module = externals.get(specifier)
    if (!module) externals.set(specifier, (module = { named: new Map() }))
    let ref =
      importedName === "default" ? module.default
      : importedName === "*" ? module.namespace
      : module.named.get(importedName)
    if (!ref) {
      ref = { name: unique(preferred), typeOnly }
      if (importedName === "default") module.default = ref
      else if (importedName === "*") module.namespace = ref
      else module.named.set(importedName, ref)
    } else if (!typeOnly) {
      ref.typeOnly = false
    }
    return { kind: "external", ref }
  }

  function includeStatement(statement: Node, preferredDefault?: string) {
    if (included.has(statement)) return
    included.add(statement)
    const file = statement.getSourceFile()
    for (const name of getIntroducedNames(statement)) claim(keyOf(file, name), name, statement)
    if (isAnonymousDefault(statement)) {
      claim(keyOf(file, "default"), preferredDefault ?? defaultName(file), statement)
    }
    for (const id of statement.getDescendantsOfKind(SyntaxKind.Identifier)) resolveReference(id)
    order.push(statement)
  }

  /**
   * Resolves an identifier that refers to a module-scope declaration or an import binding,
   * including whatever it needs. Returns the target and the node that stands for it, which is
   * the whole `ns.x` for a member of an inlined namespace.
   */
  function resolveReference(id: Identifier): { target: Target; node: Node } | undefined {
    if (isMemberName(id)) return
    const declaration = getReferencedDeclaration(id)
    if (!declaration) return
    const local = id.getText()

    if (Node.isImportSpecifier(declaration)) {
      const importDeclaration = declaration.getImportDeclaration()
      const typeOnly = importDeclaration.isTypeOnly() || declaration.isTypeOnly()
      const target = resolveFrom(importDeclaration, declaration.getName(), local, typeOnly)
      return target && { target, node: id }
    }
    if (Node.isImportClause(declaration)) {
      const importDeclaration = declaration.getParentIfKindOrThrow(SyntaxKind.ImportDeclaration)
      const target = resolveFrom(importDeclaration, "default", local, declaration.isTypeOnly())
      return target && { target, node: id }
    }
    if (Node.isNamespaceImport(declaration)) {
      const importDeclaration = declaration.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration)
      const file = moduleOf(importDeclaration)
      if (!file) {
        const target = resolveFrom(importDeclaration, "*", local, importDeclaration.isTypeOnly())
        return target && { target, node: id }
      }
      const member = getNamespaceMember(id)
      const target = member ? resolveExport(file, member.name) : resolveExport(file, "*", local)
      return target && { target, node: member?.node ?? id }
    }

    const file = id.getSourceFile()
    const declarations = getDeclarationsNamed(file, local)
    for (const node of declarations.length ? declarations : [declaration]) {
      includeStatement(getStatementOf(node))
    }
    return { target: { kind: "local", key: keyOf(file, local) }, node: id }
  }

  function resolveFrom(
    declaration: ImportDeclaration | ExportDeclaration,
    importedName: string,
    preferred: string,
    typeOnly: boolean,
  ): Target | undefined {
    const file = moduleOf(declaration)
    if (file) return resolveExport(file, importedName, preferred)
    if (declaration.getModuleSpecifierValue() === undefined) return
    return registerExternal(externalSpecifier(declaration), importedName, preferred, typeOnly)
  }

  /** what a name refers to inside a file: its declarations, or the import that binds it */
  function resolveLocal(file: SourceFile, name: string): Target | undefined {
    const declarations = getDeclarationsNamed(file, name)
    if (declarations.length) {
      for (const declaration of declarations) includeStatement(getStatementOf(declaration))
      return { kind: "local", key: keyOf(file, name) }
    }
    const binding = findImportBinding(file, name)
    return binding && resolveFrom(binding.declaration, binding.importedName, name, binding.typeOnly)
  }

  function resolveExport(file: SourceFile, name: string, preferred?: string): Target | undefined {
    const key = keyOf(file, name)
    if (exportCache.has(key)) return exportCache.get(key) ?? undefined
    exportCache.set(key, null)
    const target = findExport(
      file,
      name,
      preferred ?? (name === "*" || name === "default" ? defaultName(file) : name),
    )
    exportCache.set(key, target ?? null)
    return target
  }

  function findExport(file: SourceFile, name: string, preferred: string): Target | undefined {
    if (name === "*") return includeNamespace(file, preferred)

    let target: Target | undefined
    const stars: ExportDeclaration[] = []
    for (const declaration of file.getExportDeclarations()) {
      if (isStarExport(declaration)) {
        stars.push(declaration)
      } else if (declaration.isNamespaceExport()) {
        if (declaration.getNamespaceExport()?.getName() !== name) continue
        target ??= resolveFrom(declaration, "*", name, declaration.isTypeOnly())
      } else {
        for (const specifier of declaration.getNamedExports()) {
          if (getExportedName(specifier) !== name) continue
          const typeOnly = declaration.isTypeOnly() || specifier.isTypeOnly()
          target ??= declaration.hasModuleSpecifier()
            ? resolveFrom(declaration, specifier.getName(), preferred, typeOnly)
            : resolveLocal(file, specifier.getName())
        }
      }
    }

    if (name === "default") {
      for (const statement of file.getStatements()) {
        if (!isDefaultExport(statement)) continue
        const expression = Node.isExportAssignment(statement) ? statement.getExpression() : undefined
        if (Node.isIdentifier(expression)) {
          // `export default foo` is just another name for foo
          target ??= resolveReference(expression)?.target
        } else {
          includeStatement(statement, preferred)
          target ??= { kind: "local", key: keyOf(file, getIntroducedNames(statement)[0] ?? "default") }
        }
      }
    } else {
      const declarations = getDeclarationsNamed(file, name).filter(isExported)
      for (const declaration of declarations) includeStatement(getStatementOf(declaration))
      if (declarations.length) target ??= { kind: "local", key: keyOf(file, name) }
    }
    if (target) return target

    // `export *` names nothing, so probe each project module it forwards until one has the name
    for (const star of stars) {
      const module = moduleOf(star)
      const found = module && resolveExport(module, name, preferred)
      if (found) return found
    }
  }

  function includeNamespace(file: SourceFile, preferred: string): Target {
    const key = keyOf(file, "*")
    if (!names.has(key)) {
      claim(key, preferred)
      const entries: [string, Target][] = []
      for (const name of getExportedNames(file)) {
        const target = resolveExport(file, name)
        if (target) entries.push([name, target])
      }
      order.push({ key, entries })
    }
    return { kind: "local", key }
  }

  function getExportedNames(file: SourceFile, seen = new Set<SourceFile>()): string[] {
    if (seen.has(file)) return []
    seen.add(file)
    const result = new Set<string>()
    for (const statement of file.getStatements()) {
      if (Node.isExportDeclaration(statement)) {
        if (isStarExport(statement)) {
          const module = moduleOf(statement)
          for (const name of module ? getExportedNames(module, seen) : []) {
            if (name !== "default") result.add(name)
          }
        } else if (statement.isNamespaceExport()) {
          result.add(statement.getNamespaceExportOrThrow().getName())
        } else {
          for (const specifier of statement.getNamedExports()) result.add(getExportedName(specifier))
        }
      } else if (isDefaultExport(statement)) {
        result.add("default")
      } else if (Node.isExportable(statement) && statement.hasExportKeyword()) {
        for (const name of getIntroducedNames(statement)) result.add(name)
      }
    }
    return [...result]
  }

  function printStatement(statement: Node): string {
    const start = statement.getStart()
    const text = statement.getText()
    const file = statement.getSourceFile()
    const edits = getCommentEdits(statement, text)
    const replace = (node: Node, replacement: string) =>
      edits.push({ start: node.getStart() - start, end: node.getEnd() - start, text: replacement })

    if (Node.isExportAssignment(statement)) {
      edits.push({
        start: 0,
        end: statement.getExpression().getStart() - start,
        text: `const ${names.get(keyOf(file, "default"))} = `,
      })
    } else if (!kept.has(statement) && Node.isModifierable(statement)) {
      for (const modifier of statement.getModifiers()) {
        const kind = modifier.getKind()
        if (kind !== SyntaxKind.ExportKeyword && kind !== SyntaxKind.DefaultKeyword) continue
        const end = modifier.getEnd() - start
        edits.push({ start: modifier.getStart() - start, end: end + /^\s*/.exec(text.slice(end))![0].length, text: "" })
      }
      if (isAnonymousDefault(statement)) {
        edits.push({ start: 0, end: 0, text: `const ${names.get(keyOf(file, "default"))} = ` })
      }
    }

    for (const id of statement.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const reference = resolveReference(id)
      if (!reference) continue
      const name = nameOf(reference.target)
      if (reference.node !== id) {
        replace(reference.node, name)
        continue
      }
      if (name === id.getText()) continue
      const parent = id.getParent()
      replace(id, Node.isShorthandPropertyAssignment(parent) ? `${id.getText()}: ${name}` : name)
    }
    return applyEdits(text, edits)
  }

  function printNamespace({ key, entries }: NamespaceObject): string {
    const fields = entries
      .filter(([, target]) => isValue(target))
      .map(([exported, target]) => {
        const name = nameOf(target)
        return exported === name ? name : `${exported}: ${name}`
      })
    return `const ${names.get(key)} = ${fields.length ? `{ ${fields.join(", ")} }` : "{}"}`
  }

  for (const item of items) {
    const file = project.addSourceFileAtPath(resolve(root, item.file))
    for (const name of item.symbols) {
      const declarations = getDeclarationsNamed(file, name)
      for (const declaration of declarations) {
        const statement = getStatementOf(declaration)
        kept.add(statement)
        includeStatement(statement)
      }
      if (declarations.length) continue
      if (!resolveLocal(file, name) && !resolveExport(file, name)) {
        throw new Error(`${item.file}: no declaration or export named "${name}"`)
      }
    }
  }

  const body = order.map(entry => (entry instanceof Node ? printStatement(entry) : printNamespace(entry)))
  const imports = [...externals].flatMap(([specifier, module]) => printImports(specifier, module))
  return [imports.join("\n"), ...body].filter(Boolean).join("\n\n") + "\n"
}

function printImports(specifier: string, module: ExternalModule): string[] {
  const from = JSON.stringify(specifier)
  const lines: string[] = []
  if (module.namespace) {
    const type = module.namespace.typeOnly ? "type " : ""
    lines.push(`import ${type}* as ${module.namespace.name} from ${from}`)
  }
  const named = [...module.named].map(([imported, ref]) => ({
    text: imported === ref.name ? imported : `${imported} as ${ref.name}`,
    typeOnly: ref.typeOnly,
  }))
  const main = module.default
  if (!main && !named.length) return lines

  const allTypes = (!main || main.typeOnly) && named.every(entry => entry.typeOnly)
  const list = `{ ${named.map(entry => (!allTypes && entry.typeOnly ? `type ${entry.text}` : entry.text)).join(", ")} }`
  if (allTypes && main && named.length) {
    // `import type A, { B }` is not allowed
    lines.push(`import type ${main.name} from ${from}`, `import type ${list} from ${from}`)
  } else {
    const parts = [...(main ? [main.name] : []), ...(named.length ? [list] : [])]
    lines.push(`import ${allTypes ? "type " : ""}${parts.join(", ")} from ${from}`)
  }
  return lines
}

/** the import binding or module-scope declaration of the identifier's own file that it refers to */
function getReferencedDeclaration(id: Identifier): Node | undefined {
  const parent = id.getParent()
  const symbol =
    Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === id
      ? id.getProject().getTypeChecker().getShorthandAssignmentValueSymbol(parent)
      : id.getSymbol()
  const file = id.getSourceFile()
  for (const declaration of symbol?.getDeclarations() ?? []) {
    if (declaration.getSourceFile() !== file) continue
    if (
      Node.isImportSpecifier(declaration) ||
      Node.isImportClause(declaration) ||
      Node.isNamespaceImport(declaration) ||
      isModuleScope(declaration)
    ) {
      return declaration
    }
  }
}

function isModuleScope(declaration: Node): boolean {
  let node = declaration
  while (Node.isBindingElement(node) || Node.isObjectBindingPattern(node) || Node.isArrayBindingPattern(node)) {
    node = node.getParentOrThrow()
  }
  if (Node.isVariableDeclaration(node)) return node.getVariableStatement()?.getParent() === node.getSourceFile()
  return node === declaration && declaration.getParent() === declaration.getSourceFile()
}

/** the statement a module-scope declaration lives in (the variable statement for a declarator) */
function getStatementOf(declaration: Node): Node {
  return Node.isVariableDeclaration(declaration) || Node.isBindingElement(declaration)
    ? declaration.getFirstAncestorByKindOrThrow(SyntaxKind.VariableStatement)
    : declaration
}

/** the module-scope names a statement declares */
function getIntroducedNames(statement: Node): string[] {
  if (Node.isVariableStatement(statement)) {
    return statement.getDeclarations().flatMap(declaration => {
      const name = declaration.getNameNode()
      if (Node.isIdentifier(name)) return [name.getText()]
      return name
        .getDescendantsOfKind(SyntaxKind.BindingElement)
        .map(element => element.getNameNode())
        .filter(Node.isIdentifier)
        .map(id => id.getText())
    })
  }
  if (Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) {
    const name = statement.getName()
    return name ? [name] : []
  }
  if (
    Node.isInterfaceDeclaration(statement) ||
    Node.isTypeAliasDeclaration(statement) ||
    Node.isEnumDeclaration(statement) ||
    (Node.isModuleDeclaration(statement) && Node.isIdentifier(statement.getNameNode()))
  ) {
    return [statement.getName()]
  }
  return []
}

/** a namespace import used as `ns.x` or `ns.X`: the member name and the whole access */
function getNamespaceMember(id: Identifier): { name: string; node: Node } | undefined {
  const parent = id.getParent()
  if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === id) {
    return { name: parent.getName(), node: parent }
  }
  if (Node.isQualifiedName(parent) && parent.getLeft() === id) {
    return { name: parent.getRight().getText(), node: parent }
  }
}

/** the import that introduces a local name into a file */
function findImportBinding(
  file: SourceFile,
  name: string,
): { declaration: ImportDeclaration; importedName: string; typeOnly: boolean } | undefined {
  for (const declaration of file.getImportDeclarations()) {
    const clause = declaration.getImportClause()
    if (!clause) continue
    const typeOnly = clause.isTypeOnly()
    if (clause.getDefaultImport()?.getText() === name) return { declaration, importedName: "default", typeOnly }
    const named = clause.getNamedBindings()
    if (Node.isNamespaceImport(named) && named.getName() === name) {
      return { declaration, importedName: "*", typeOnly }
    }
    if (Node.isNamedImports(named)) {
      for (const specifier of named.getElements()) {
        if ((specifier.getAliasNode() ?? specifier.getNameNode()).getText() !== name) continue
        return { declaration, importedName: specifier.getName(), typeOnly: typeOnly || specifier.isTypeOnly() }
      }
    }
  }
}

function getExportedName(specifier: ExportSpecifier): string {
  return (specifier.getAliasNode() ?? specifier.getNameNode()).getText()
}

/** `export * from "./x"`, as opposed to `export * as ns from` or a named export */
function isStarExport(declaration: ExportDeclaration): boolean {
  return declaration.compilerNode.exportClause === undefined && declaration.hasModuleSpecifier()
}

function isDefaultExport(statement: Node): boolean {
  if (Node.isExportAssignment(statement)) return !statement.isExportEquals()
  return Node.isExportable(statement) && statement.hasDefaultKeyword()
}

/** `export default <expression>`, or a default function or class without a name */
function isAnonymousDefault(statement: Node): boolean {
  if (Node.isExportAssignment(statement)) return !statement.isExportEquals()
  return (
    (Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) &&
    statement.hasDefaultKeyword() &&
    !statement.getName()
  )
}

function isTypeDeclaration(statement: Node): boolean {
  return Node.isInterfaceDeclaration(statement) || Node.isTypeAliasDeclaration(statement)
}

/** a name for an anonymous default export, taken from its file name */
function defaultName(file: SourceFile): string {
  const base = file.getBaseNameWithoutExtension().replace(/[^\w$]+(.)?/g, (_, next?: string) => next?.toUpperCase() ?? "")
  if (!base) return "_default"
  return /^\d/.test(base) ? `_${base}` : base
}

/**
 * Edits that remove every comment inside a statement. A comment alone on its line takes the
 * line with it, and a trailing comment takes the whitespace in front of it.
 */
function getCommentEdits(statement: Node, text: string): Edit[] {
  const start = statement.getStart()
  const end = statement.getEnd()
  const full = statement.getSourceFile().getFullText()
  const jsxText = statement.getDescendantsOfKind(SyntaxKind.JsxText).map(node => [node.getPos(), node.getEnd()])
  const ranges = new Map<number, number>()
  const collect = (list: ts.CommentRange[] | undefined) => {
    for (const range of list ?? []) {
      if (range.pos < start || range.end > end) continue
      // `//` inside JSX text is text
      if (jsxText.some(([from, to]) => range.pos >= from && range.end <= to)) continue
      ranges.set(range.pos, range.end)
    }
  }
  for (const node of [statement, ...statement.getDescendants()]) {
    collect(ts.getLeadingCommentRanges(full, node.getPos()))
    collect(ts.getTrailingCommentRanges(full, node.getEnd()))
  }

  const merged: [number, number][] = []
  for (const [pos, rangeEnd] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const from = pos - start
    const to = rangeEnd - start
    const last = merged.at(-1)
    if (last && /^[ \t]*$/.test(text.slice(last[1], from))) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }

  return merged.map(([from, to]) => {
    const lineStart = text.lastIndexOf("\n", from - 1) + 1
    const newline = text.indexOf("\n", to)
    const lineEnd = newline === -1 ? text.length : newline
    const before = text.slice(lineStart, from)
    const after = text.slice(to, lineEnd)
    if (!before.trim() && !after.trim()) {
      return { start: lineStart, end: newline === -1 ? lineEnd : newline + 1, text: "" }
    }
    if (!before.trim()) return { start: from, end: to + after.length - after.trimStart().length, text: "" }
    return { start: from - (before.length - before.trimEnd().length), end: to, text: "" }
  })
}

/** applies edits from the back, skipping any that overlap one already applied */
function applyEdits(text: string, edits: Edit[]): string {
  let result = text
  let floor = Infinity
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > floor) continue
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
    floor = edit.start
  }
  return result
}
