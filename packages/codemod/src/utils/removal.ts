import { Node, SyntaxKind, type ExportSpecifier, type ImportDeclaration, type SourceFile } from "ts-morph"

import { removeImportSpecifier } from "./imports"
import { contains } from "./references"
import { removeDeclaration } from "./variables"

/* Drops a named export, removing the whole export declaration once it has no
   specifiers left. */
export function removeExportSpecifier(specifier: ExportSpecifier): void {
	const declaration = specifier.getExportDeclaration()
	specifier.remove()
	if (declaration.getNamedExports().length === 0) declaration.remove()
}

/* Removes any node that stands for a declaration or a binding, picking the right
   removal for variable declarators and for import and export bindings so their
   enclosing statement goes away once it is empty. */
export function removeNode(node: Node): void {
	if (node.wasForgotten()) return

	if (Node.isVariableDeclaration(node)) return removeDeclaration(node)
	if (Node.isImportSpecifier(node)) return removeImportSpecifier(node)
	if (Node.isExportSpecifier(node)) return removeExportSpecifier(node)

	if (Node.isImportClause(node)) {
		const declaration = node.getParent() as ImportDeclaration
		declaration.removeDefaultImport()
		if (!declaration.getImportClause()) declaration.remove()
		return
	}

	if (Node.isNamespaceImport(node)) {
		node.getFirstAncestorByKindOrThrow(SyntaxKind.ImportDeclaration).remove()
		return
	}

	const removable = node as Node & { remove?: () => void }
	removable.remove?.()
}

/* Removes the import bindings in a file that nothing in that file still uses,
   leaving side-effect imports alone. */
export function removeUnusedImports(file: SourceFile): void {
	for (const declaration of [...file.getImportDeclarations()]) {
		if (declaration.wasForgotten()) continue
		if (!declaration.getImportClause()) continue

		for (const specifier of [...declaration.getNamedImports()]) {
			if (isUnusedLocally(specifier)) removeImportSpecifier(specifier)
		}

		if (declaration.wasForgotten()) continue

		const defaultImport = declaration.getDefaultImport()
		if (defaultImport && isUnusedLocally(defaultImport)) removeNode(defaultImport.getParentOrThrow())

		if (declaration.wasForgotten()) continue

		const namespaceImport = declaration.getNamespaceImport()
		if (namespaceImport && isUnusedLocally(namespaceImport)) declaration.remove()
	}
}

function isUnusedLocally(node: Node): boolean {
	if (!Node.isReferenceFindable(node)) return false
	const file = node.getSourceFile()
	return !node
		.findReferencesAsNodes()
		.some(reference => reference.getSourceFile() === file && !contains(node, reference))
}
