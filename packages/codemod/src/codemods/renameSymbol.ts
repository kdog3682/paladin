import { Node } from "ts-morph"
import type { Project } from "ts-morph"
import { findDeclaration } from "../utils/declarations"

export function renameSymbol(project: Project, from: string, to: string, file?: string) {
	const declaration = findDeclaration(project, from, file)

	if (!Node.hasName(declaration)) {
		throw new Error(`renameSymbol: the declaration of "${from}" has no name to rename`)
	}

	const name = declaration.getNameNode()
	if (!Node.isIdentifier(name)) {
		throw new Error(`renameSymbol: "${from}" is bound by a pattern, not an identifier`)
	}

	name.rename(to)
}
