import { Node } from "ts-morph"
import type { Project, SourceFile } from "ts-morph"
import { getExportableNode } from "./getExportableNode"

/* Collects the module-scope declarations in a file that carry a given name,
   descending into variable statements so each declarator is returned on its own. */
export function getDeclarationsNamed(file: SourceFile, name: string): Node[] {
	const found: Node[] = []

	for (const statement of file.getStatements()) {
		if (Node.isVariableStatement(statement)) {
			for (const declaration of statement.getDeclarations()) {
				if (declaration.getName() === name) found.push(declaration)
			}
			continue
		}

		if (Node.hasName(statement) && statement.getName() === name) found.push(statement)
	}

	return found
}

/* Resolves a name to exactly one declaration: the module-scope declarations of the
   given file, or the exported declarations of the whole project when no file is
   given. Throws when the name resolves to zero or to more than one declaration. */
export function findDeclaration(project: Project, name: string, filePath?: string): Node {
	if (filePath != null) {
		const file = project.getSourceFile(filePath)
		if (!file) throw new Error(`findDeclaration: no source file at "${filePath}"`)

		const declarations = getDeclarationsNamed(file, name)
		if (declarations.length === 0) throw new Error(`findDeclaration: "${name}" is not declared in ${filePath}`)
		if (declarations.length > 1) {
			throw new Error(`findDeclaration: "${name}" is declared ${declarations.length} times in ${filePath}`)
		}

		return declarations[0]!
	}

	const matches = project
		.getSourceFiles()
		.flatMap(file => getDeclarationsNamed(file, name))
		.filter(isExported)

	if (matches.length === 0) throw new Error(`findDeclaration: no exported declaration named "${name}"`)
	if (matches.length > 1) {
		const paths = [...new Set(matches.map(match => match.getSourceFile().getFilePath()))].join(", ")
		throw new Error(`findDeclaration: "${name}" is ambiguous, declared in ${paths} — pass a file to disambiguate`)
	}

	return matches[0]!
}

/* Tells whether a declaration is exported from the module it lives in. */
export function isExported(node: Node): boolean {
	return getExportableNode(node)?.isExported() ?? false
}
