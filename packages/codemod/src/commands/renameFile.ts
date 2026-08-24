import type { Project } from "ts-morph"

export function renameFile(project: Project, from: string, to: string) {
	const file = project.getSourceFile(from)
	if (!file) throw new Error(`renameFile: no source file at "${from}"`)

	const path = to.endsWith("/") ? `${to}${file.getBaseName()}` : to
	const destination = path.startsWith("/") ? path : `/${path}`
	if (project.getSourceFile(destination)) throw new Error(`renameFile: "${destination}" already exists`)

	file.move(destination)
}
