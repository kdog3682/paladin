import path from "node:path"
import { Node, SyntaxKind, type Project, type SourceFile } from "ts-morph"
import { findDeclaration, getDeclarationsNamed, isExported } from "../utils/declarations"
import { getExportableNode } from "../utils/getExportableNode"
import {
	addNamedImport,
	copyImportsFor,
	getImportsOf,
	removeImportSpecifier,
	removeUnusedImports,
} from "../utils/imports"
import { isMemberName } from "../utils/nodes"
import { getLocalDependencies, isOnlyReferencedWithin } from "../utils/references"

export function extractSymbol(project: Project, file: string, symbol: string, newFile: string, newName?: string) {
	const source = resolveSourceFile(project, file)
	const name = newName ?? symbol

	if (newName) rename(findDeclaration(project, symbol, source.getFilePath()), newName)

	const root = getExportableNode(findDeclaration(project, name, source.getFilePath()))
	if (!root) throw new Error(`${symbol} cannot be moved out of ${source.getFilePath()}`)

	const moving = collectMovable(root)
	const shared = collectShared(moving)
	const target = getOrCreateTarget(project, source, newFile)

	copyImportsFor(moving, target)

	for (const statement of shared) {
		if (Node.isExportable(statement)) statement.setIsExported(true)
		for (const sharedName of declaredNames(statement)) addNamedImport(target, source, sharedName)
	}

	target.addStatements(moving.map(statement => statement.getFullText().trim()).join("\n\n"))
	for (const statement of moving) remove(statement)

	exportSymbol(target, name)
	redirectImports(project, source, target, name)
	if (referencesName(source, name)) addNamedImport(source, target, name)
	removeUnusedImports(source)
}

function collectMovable(root: Node) {
	const moving = [root]

	for (;;) {
		const next = moving
			.flatMap(getLocalDependencies)
			.filter(dependency => !moving.includes(dependency))
			.filter(dependency => !isExported(dependency) && isOnlyReferencedWithin(dependency, moving))

		if (!next.length) break
		for (const dependency of next) if (!moving.includes(dependency)) moving.push(dependency)
	}

	return moving.sort((a, b) => a.getPos() - b.getPos())
}

function collectShared(moving: Node[]) {
	return [...new Set(moving.flatMap(getLocalDependencies).filter(dependency => !moving.includes(dependency)))]
}

function getOrCreateTarget(project: Project, source: SourceFile, newFile: string) {
	const resolved = path.isAbsolute(newFile) ? newFile : path.resolve(source.getDirectoryPath(), newFile)
	const filePath = path.extname(resolved) ? resolved : `${resolved}.ts`

	return project.getSourceFile(filePath) ?? project.createSourceFile(filePath, "")
}

function exportSymbol(file: SourceFile, name: string) {
	for (const declaration of getDeclarationsNamed(file, name)) {
		const statement = getExportableNode(declaration)
		if (statement && Node.isExportable(statement)) statement.setIsExported(true)
	}
}

function redirectImports(project: Project, source: SourceFile, target: SourceFile, name: string) {
	for (const file of project.getSourceFiles()) {
		if (file === target) continue

		for (const declaration of getImportsOf(file, source)) {
			for (const specifier of declaration.getNamedImports()) {
				if (specifier.getName() !== name) continue

				const alias = specifier.getAliasNode()?.getText()
				const isTypeOnly = specifier.isTypeOnly() || declaration.isTypeOnly()
				const insertIndex = file.getImportDeclarations().indexOf(declaration)
				removeImportSpecifier(specifier)
				addNamedImport(file, target, name, { alias, isTypeOnly, insertIndex })
			}
		}
	}
}

function referencesName(file: SourceFile, name: string) {
	return file
		.getDescendantsOfKind(SyntaxKind.Identifier)
		.some(
			identifier =>
				identifier.getText() === name &&
				!isMemberName(identifier) &&
				!identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
		)
}

function resolveSourceFile(project: Project, file: string) {
	const found = project.getSourceFile(file) ?? project.getSourceFiles().find(f => f.getFilePath().endsWith(`/${file}`))
	if (!found) throw new Error(`no source file matching ${file}`)

	return found
}

function declaredNames(statement: Node): string[] {
	if (Node.isVariableStatement(statement)) return statement.getDeclarations().map(declaration => declaration.getName())

	const name = (statement as Node & { getName?: () => string | undefined }).getName?.()
	return name ? [name] : []
}

function rename(declaration: Node, newName: string) {
	const renameable = declaration as Node & { rename?: (name: string) => void }
	if (!renameable.rename) throw new Error(`${declaration.getKindName()} cannot be renamed`)

	renameable.rename(newName)
}

function remove(statement: Node) {
	const removable = statement as Node & { remove?: () => void }
	if (!removable.remove) throw new Error(`${statement.getKindName()} cannot be removed`)

	removable.remove()
}
