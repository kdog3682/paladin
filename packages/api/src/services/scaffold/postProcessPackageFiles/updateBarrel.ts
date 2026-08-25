import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import type { PackageData } from "../types"

const SOURCE_EXTENSIONS = [".ts", ".tsx"]
const BARREL_NAMES = new Set(["utils"])

/** Export every module below a utils/ dir, at any depth: fs/foobar.ts -> ./fs/foobar. */
export async function updateBarrel(pkg: PackageData) {
	const barrels = new Map<string, Set<string>>()
	for (const file of pkg.files) {
		const entry = barrelEntry(pkg, file.relpath)
		if (!entry) continue
		const specifiers = barrels.get(entry.dir) ?? new Set<string>()
		specifiers.add(entry.specifier)
		barrels.set(entry.dir, specifiers)
	}
	for (const [dir, specifiers] of barrels) {
		const lines = [...specifiers].sort().map((s) => `export * from "./${s}"`)
		await appendFile(join(pkg.dir, dir, "index.ts"), `\n${lines.join("\n")}\n`, "utf8")
	}
}

/**
 * A file barrels into its nearest enclosing utils/ dir, wherever that sits. When
 * the package itself is utils the barrel is its own src/index.ts, or the package
 * root if there's no src/. Everything else has no barrel and is skipped.
 */
function barrelEntry(pkg: PackageData, relpath: string) {
	const ext = SOURCE_EXTENSIONS.find((e) => relpath.endsWith(e))
	if (!ext) return null
	const segments = relpath.slice(0, -ext.length).split("/")
	const dirs = segments.slice(0, -1)
	let start = dirs.findLastIndex((s) => BARREL_NAMES.has(s)) + 1
	if (start === 0) {
		if (!BARREL_NAMES.has(pkg.name)) return null
		if (dirs[0] === "src") start = 1
	}
	const rest = segments.slice(start)
	const specifier = rest.at(-1) === "index" ? rest.slice(0, -1).join("/") : rest.join("/")
	if (!specifier) return null
	return { dir: segments.slice(0, start).join("/"), specifier }
}
