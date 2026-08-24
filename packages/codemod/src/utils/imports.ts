import { ImportDeclaration, ImportSpecifier, SourceFile } from "ts-morph"

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
