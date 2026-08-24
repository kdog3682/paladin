import { Node } from "ts-morph"
import type { ImportSpecifier, Project, SourceFile } from "ts-morph"
import { findDeclaration } from "../utils/declarations"
import { addNamedImport, removeImportSpecifier } from "../utils/imports"

export function remapSymbol(project: Project, from: string, to: string) {
	const source = parseReference(from)
	const destination = parseReference(to)

	const declaration = findDeclaration(project, source.name, source.file)
	const replacement = findDeclaration(project, destination.name, destination.file)

	const declaringFile = declaration.getSourceFile()
	const targetFile = replacement.getSourceFile()

	const sites = importSpecifiersOf(declaration)
		.filter(specifier => {
			const file = specifier.getSourceFile()
			return file !== declaringFile && file !== targetFile
		})
		.map(specifier => ({
			file: specifier.getSourceFile(),
			moduleSpecifier: specifier.getImportDeclaration().getModuleSpecifierValue(),
			name: specifier.getName(),
			alias: specifier.getAliasNode()?.getText(),
			isTypeOnly: specifier.isTypeOnly() || specifier.getImportDeclaration().isTypeOnly(),
		}))

	for (const site of sites) {
		const specifier = findSpecifier(site.file, site.moduleSpecifier, site.name)
		if (!specifier) continue

		if (!site.alias) specifier.renameAlias(destination.name)

		const current = findSpecifier(site.file, site.moduleSpecifier, site.name)
		if (current) removeImportSpecifier(current)

		addNamedImport(site.file, targetFile, destination.name, {
			alias: site.alias,
			isTypeOnly: site.isTypeOnly,
		})
	}
}

function parseReference(reference: string) {
	const index = reference.indexOf("#")
	if (index === -1) return { file: undefined, name: reference }
	return { file: reference.slice(0, index), name: reference.slice(index + 1) }
}

function importSpecifiersOf(declaration: Node): ImportSpecifier[] {
	if (!Node.hasName(declaration)) return []

	const name = declaration.getNameNode()
	if (!Node.isIdentifier(name)) return []

	return name
		.findReferencesAsNodes()
		.map(reference => reference.getParent())
		.filter((parent): parent is ImportSpecifier => parent != null && Node.isImportSpecifier(parent))
}

function findSpecifier(file: SourceFile, moduleSpecifier: string, name: string) {
	for (const declaration of file.getImportDeclarations()) {
		if (declaration.getModuleSpecifierValue() !== moduleSpecifier) continue

		const specifier = declaration.getNamedImports().find(named => named.getName() === name)
		if (specifier) return specifier
	}
}
