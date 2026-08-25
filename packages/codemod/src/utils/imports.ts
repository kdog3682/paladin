import { ImportDeclaration, ImportSpecifier, Node, SourceFile, SyntaxKind, ts } from "ts-morph"

/** Drops a named import, removing the whole import declaration once it has no bindings left. */
export function removeImportSpecifier(specifier: ImportSpecifier): void {
  const declaration = specifier.getImportDeclaration()
  const isOnlyBinding =
    declaration.getNamedImports().length === 1 &&
    !declaration.getDefaultImport() &&
    !declaration.getNamespaceImport()

  if (isOnlyBinding) declaration.remove()
  else specifier.remove()
}

/** Finds the import declarations in a file that resolve to a given source file. */
export function getImportsOf(file: SourceFile, target: SourceFile): ImportDeclaration[] {
  const targetPath = target.getFilePath()
  return file
    .getImportDeclarations()
    .filter(declaration => declaration.getModuleSpecifierSourceFile()?.getFilePath() === targetPath)
}


/* Adds a named import of a symbol declared in a target file, reusing an existing
   import declaration for that file when one matches and returning the binding
   untouched when it is already imported. */
export function addNamedImport(
  file: SourceFile,
  target: SourceFile,
  name: string,
  options: { alias?: string; isTypeOnly?: boolean; insertIndex?: number } = {},
): ImportSpecifier {
  const { alias, isTypeOnly = false, insertIndex } = options

  for (const declaration of getImportsOf(file, target)) {
    if (declaration.isTypeOnly() !== isTypeOnly) continue
    if (declaration.getNamespaceImport()) continue

    const existing = declaration
      .getNamedImports()
      .find(specifier => specifier.getName() === name && specifier.getAliasNode()?.getText() === alias)

    return existing ?? declaration.addNamedImport({ name, alias })
  }

  const moduleSpecifier = file.getRelativePathAsModuleSpecifierTo(target)
  const structure = { moduleSpecifier, isTypeOnly, namedImports: [{ name, alias }] }
  const declaration =
    insertIndex === undefined ? file.addImportDeclaration(structure) : file.insertImportDeclaration(insertIndex, structure)
  stripTrailingSemicolon(declaration)

  return declaration.getNamedImports()[0]!
}

// addImportDeclaration always prints a trailing semicolon; formatText() would strip it but
// reformats the whole file (clobbering the file's existing indentation style), so remove it directly.
function stripTrailingSemicolon(declaration: ImportDeclaration) {
  declaration.getLastChildByKind(ts.SyntaxKind.SemicolonToken)?.replaceWithText('')
}

import { isMemberName } from "./nodes"

/* Removes the import bindings of a file that nothing references any more, dropping
   declarations that end up with no bindings and leaving side-effect imports alone. */
export function removeUnusedImports(file: SourceFile): void {
  for (const declaration of file.getImportDeclarations()) {
    if (!declaration.getImportClause()) continue

    for (const specifier of declaration.getNamedImports()) {
      if (!isUsed(specifier.getAliasNode() ?? specifier.getNameNode())) removeImportSpecifier(specifier)
    }
    if (declaration.wasForgotten()) continue

    const defaultImport = declaration.getDefaultImport()
    if (defaultImport && !isUsed(defaultImport)) declaration.removeDefaultImport()

    const namespaceImport = declaration.getNamespaceImport()
    if (namespaceImport && !isUsed(namespaceImport)) declaration.removeNamespaceImport()

    if (!declaration.getImportClause()) declaration.remove()
  }
}

/* Recreates in a target file the import bindings a set of nodes relies on, rebasing
   relative module specifiers onto the target's location and reusing an import
   declaration for that module when one already matches. */
export function copyImportsFor(nodes: Node[], target: SourceFile): void {
  for (const node of nodes) {
    for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (isMemberName(identifier)) continue
      for (const declaration of identifier.getSymbol()?.getDeclarations() ?? []) copyBinding(declaration, target)
    }
  }
}

// Building an import declaration in two steps - add it empty, then attach a binding - breaks
// on `isTypeOnly` declarations: ts-morph can't print a syntactically valid empty `import type`
// statement, so the intermediate state fails to parse. Each branch below instead creates the
// declaration with its first binding already attached when there's no existing one to reuse.
function copyBinding(binding: Node, target: SourceFile) {
  const declaration = binding.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
  if (!declaration || declaration.getSourceFile() === target) return

  const resolved = declaration.getModuleSpecifierSourceFile()
  const moduleSpecifier = resolved
    ? target.getRelativePathAsModuleSpecifierTo(resolved)
    : declaration.getModuleSpecifierValue()
  const isTypeOnly = declaration.isTypeOnly()
  const existing = findImportDeclaration(target, moduleSpecifier, isTypeOnly)

  if (Node.isImportSpecifier(binding)) {
    const name = binding.getName()
    const alias = binding.getAliasNode()?.getText()
    const specifierIsTypeOnly = binding.isTypeOnly()

    if (existing) {
      if (!existing.getNamedImports().some(specifier => specifier.getName() === name)) {
        existing.addNamedImport({ name, alias, isTypeOnly: specifierIsTypeOnly })
      }
      return
    }

    stripTrailingSemicolon(target.addImportDeclaration({ moduleSpecifier, isTypeOnly, namedImports: [{ name, alias, isTypeOnly: specifierIsTypeOnly }] }))
    return
  }

  if (Node.isNamespaceImport(binding)) {
    if (existing) {
      if (!existing.getNamespaceImport()) existing.setNamespaceImport(binding.getName())
      return
    }

    stripTrailingSemicolon(target.addImportDeclaration({ moduleSpecifier, isTypeOnly, namespaceImport: binding.getName() }))
    return
  }

  if (Node.isImportClause(binding)) {
    const name = binding.getDefaultImport()?.getText()
    if (!name) return

    if (existing) {
      if (!existing.getDefaultImport()) existing.setDefaultImport(name)
      return
    }

    stripTrailingSemicolon(target.addImportDeclaration({ moduleSpecifier, isTypeOnly, defaultImport: name }))
  }
}

function findImportDeclaration(file: SourceFile, moduleSpecifier: string, isTypeOnly: boolean) {
  return file
    .getImportDeclarations()
    .find(declaration => declaration.getModuleSpecifierValue() === moduleSpecifier && declaration.isTypeOnly() === isTypeOnly)
}

// findReferencesAsNodes resolves through the symbol, so it returns every reference project-wide -
// including uses of the same imported name in other files. Only references within this binding's
// own file say whether *this* import is still needed here.
function isUsed(name: Node) {
  if (!Node.isReferenceFindable(name)) return true
  const file = name.getSourceFile()
  return name
    .findReferencesAsNodes()
    .some(reference => reference.getSourceFile() === file && !reference.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
}