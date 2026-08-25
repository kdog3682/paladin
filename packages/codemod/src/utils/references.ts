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

function referenceFindableNames(statement: Node) {
	const declarations = Node.isVariableStatement(statement) ? statement.getDeclarations() : [statement]
	return declarations.filter(declaration => Node.isReferenceFindable(declaration))
}

function contains(container: Node, node: Node) {
	if (container.getSourceFile() !== node.getSourceFile()) return false
	return container.getPos() <= node.getPos() && node.getEnd() <= container.getEnd()
}
