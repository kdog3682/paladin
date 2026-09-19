import { type Node, type Project, type SourceFile } from "ts-morph"

import { findDeclaration } from "../utils/declarations"
import { contains, getBindings, getImportedDependencies, getLocalDependencies, isUnused } from "../utils/references"
import { removeNode, removeUnusedImports } from "../utils/removal"
import { deleteFile, hasOnlyImports } from "../utils/source-files"

/* Deletes a symbol and everything that only existed for it: the declarations it
   depended on which nothing else uses, the imports and re-exports that bound it, and
   the files left with nothing in them. Target is `path#name`, or just `name` to
   resolve it across the project. */
export function deleteSymbol(project: Project, target: string) {
	const [head, tail] = target.split("#")
	const declaration = findDeclaration(project, tail ?? head, tail ? head : undefined)

	const touched = new Set<SourceFile>()
	remove(declaration, new Set(), touched)
	cleanup(project, touched)
}

function remove(node: Node, seen: Set<Node>, touched: Set<SourceFile>) {
	if (node.wasForgotten() || seen.has(node)) return
	seen.add(node)

	const dependencies = [...getLocalDependencies(node), ...getImportedDependencies(node)].filter(
		dependency => !contains(dependency, node),
	)
	const bindings = getBindings(node)

	touched.add(node.getSourceFile())
	for (const binding of bindings) touched.add(binding.getSourceFile())

	removeNode(node)
	for (const binding of bindings) removeNode(binding)

	for (const dependency of dependencies) {
		if (dependency.wasForgotten()) continue
		if (!isUnused(dependency)) continue
		remove(dependency, seen, touched)
	}
}

function cleanup(project: Project, touched: Set<SourceFile>) {
	let changed = true

	while (changed) {
		changed = false

		for (const file of touched) {
			if (file.wasForgotten()) continue

			const before = file.getFullText()
			removeUnusedImports(file)
			if (isEmpty(file)) deleteFile(project, file)

			if (file.wasForgotten() || file.getFullText() !== before) changed = true
		}
	}
}

function isEmpty(file: SourceFile): boolean {
	if (file.getStatements().length === 0) return true
	if (!hasOnlyImports(file)) return false
	return file.getImportDeclarations().every(declaration => declaration.getImportClause() != null)
}
