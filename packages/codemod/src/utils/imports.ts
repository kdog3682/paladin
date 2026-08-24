import { ImportDeclaration, ImportSpecifier, SourceFile, ts } from "ts-morph"

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
  options: { alias?: string; isTypeOnly?: boolean } = {},
): ImportSpecifier {
  const { alias, isTypeOnly = false } = options

  for (const declaration of getImportsOf(file, target)) {
    if (declaration.isTypeOnly() !== isTypeOnly) continue
    if (declaration.getNamespaceImport()) continue

    const existing = declaration
      .getNamedImports()
      .find(specifier => specifier.getName() === name && specifier.getAliasNode()?.getText() === alias)

    return existing ?? declaration.addNamedImport({ name, alias })
  }

  const moduleSpecifier = file.getRelativePathAsModuleSpecifierTo(target)
  const declaration = file.addImportDeclaration({ moduleSpecifier, isTypeOnly, namedImports: [{ name, alias }] })

  // addImportDeclaration always prints a trailing semicolon; formatText() would strip it but
  // reformats the whole file (clobbering the file's existing indentation style), so remove it directly.
  declaration.getLastChildByKind(ts.SyntaxKind.SemicolonToken)?.replaceWithText('')

  return declaration.getNamedImports()[0]!
}