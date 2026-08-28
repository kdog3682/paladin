import { Node, SyntaxKind } from "ts-morph"

import { getExportableNode } from "./getExportableNode"
import { isMemberName } from "./nodes"

/* Collects the module-scope declarations of the same file that a node depends on,
   returning the statement that carries each one rather than the declaration itself.
   Import bindings and anything declared inside the node are skipped. */
export function getLocalDependencies(node: Node): Node[] {
	const file = node.getSourceFile()
	const found = new Set<Node>()
	for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
		if (isMemberName(identifier)) continue
		for (const declaration of identifier.getSymbol()?.getDeclarations() ?? []) {
			if (declaration.getSourceFile() !== file) continue
			if (declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue
			const statement = getExportableNode(declaration)
			if (!statement || statement.getParent() !== file) continue
			if (statement === node) continue
			found.add(statement)
		}
	}
	return [...found]
}

/* Collects the module-scope declarations of other files that a node depends on,
   resolved through the import binding to the statement that actually declares them.
   Anything from node_modules or a .d.ts file is skipped. */
export function getImportedDependencies(node: Node): Node[] {
	const file = node.getSourceFile()
	const found = new Set<Node>()
	for (const identifier of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
		if (isMemberName(identifier)) continue
		const aliased = identifier.getSymbol()?.getAliasedSymbol()
		if (!aliased) continue
		for (const declaration of aliased.getDeclarations()) {
			const target = declaration.getSourceFile()
			if (target === file) continue
			if (target.isInNodeModules() || target.isDeclarationFile()) continue
			const statement = getExportableNode(declaration)
			if (!statement || statement.getParent() !== target) continue
			found.add(statement)
		}
	}
	return [...found]
}

/* Tells whether every reference to the names a statement introduces lives inside one
   of the given statements, ie whether it can travel with them. */
export function isOnlyReferencedWithin(statement: Node, within: Node[]): boolean {
	for (const name of referenceFindableNames(statement)) {
		for (const reference of name.findReferencesAsNodes()) {
			if (!within.some(container => contains(container, reference))) return false
		}
	}
	return true
}

/* Tells whether an identifier is a binding site — the name of an import or export
   specifier, a default import, or a namespace import — rather than a real use of the
   thing it names. */
export function isBindingSite(node: Node): boolean {
	const parent = node.getParent()
	if (!parent) return false
	return (
		Node.isImportSpecifier(parent) ||
		Node.isImportClause(parent) ||
		Node.isNamespaceImport(parent) ||
		Node.isExportSpecifier(parent)
	)
}

/* Tells whether nothing in the project still uses the names a statement introduces:
   every reference outside of it is an import or export specifier that only re-binds
   the name. */
export function isUnused(statement: Node): boolean {
	for (const name of referenceFindableNames(statement)) {
		for (const reference of name.findReferencesAsNodes()) {
			if (contains(statement, reference)) continue
			if (isBindingSite(reference)) continue
			return false
		}
	}
	return true
}

/* Collects the import and export specifiers elsewhere in the project that re-bind the
   names a statement introduces, so they can be dropped along with it. */
export function getBindings(statement: Node): Node[] {
	const found = new Set<Node>()
	for (const name of referenceFindableNames(statement)) {
		for (const reference of name.findReferencesAsNodes()) {
			if (contains(statement, reference)) continue
			if (isBindingSite(reference)) found.add(reference.getParentOrThrow())
		}
	}
	return [...found]
}

/* Tells whether a node sits inside another node, or is that node itself. */
export function contains(container: Node, node: Node) {
	if (container.getSourceFile() !== node.getSourceFile()) return false
	return container.getPos() <= node.getPos() && node.getEnd() <= container.getEnd()
}

function referenceFindableNames(statement: Node) {
	const declarations = Node.isVariableStatement(statement) ? statement.getDeclarations() : [statement]
	return declarations.filter(declaration => Node.isReferenceFindable(declaration))
}
