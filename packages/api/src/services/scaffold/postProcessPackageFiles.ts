import { existsSync } from "node:fs"
import { appendFile, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import logger from "./logger"
import type { PackageData } from "./types"

const BARREL_PACKAGES = new Set(["utils"])
const SOURCE_EXTENSIONS = [".ts", ".tsx"]
const SRC_PREFIX = "src/"
const INDEX_RELPATH = "src/index.ts"

export async function postProcessPackageFiles(pkg: PackageData) {
	await removeShadowedFiles(pkg)
	if (BARREL_PACKAGES.has(pkg.name)) await updateBarrel(pkg)
	return pkg
}

/**
 * `foobar/index.ts` supersedes a flat `foobar.ts` — drop the old module so the
 * two don't resolve ambiguously.
 */
async function removeShadowedFiles(pkg: PackageData) {
	const removed = new Set<string>()

	for (const file of pkg.files) {
		const relpath = normalize(file.relpath)
		if (!isIndexFile(relpath)) continue

		const dir = dirname(relpath)
		if (dir === "." || dir === "") continue

		for (const ext of SOURCE_EXTENSIONS) {
			const shadowed = `${dir}${ext}`
			const abs = join(pkg.dir, shadowed)
			if (!existsSync(abs)) continue

			await unlink(abs)
			removed.add(shadowed)
			logger.warn("scaffold.shadowedFileRemoved", `deleted ${shadowed}`, {
				pkg: pkg.name,
				supersededBy: relpath,
				path: abs,
			})
		}
	}

	if (removed.size === 0) return
	pkg.files = pkg.files.filter((f) => !removed.has(normalize(f.relpath)))
}

/** Append an export line to src/index.ts for every top level module under src/. */
async function updateBarrel(pkg: PackageData) {
	const indexPath = join(pkg.dir, INDEX_RELPATH)

	for (const file of pkg.files) {
		const specifier = barrelSpecifier(normalize(file.relpath))
		if (!specifier) continue
		await appendFile(indexPath, `\nexport * from "./${specifier}"\n`, "utf8")
	}
}

/** src/foo.ts and src/foo/index.ts both export as ./foo — anything else is skipped. */
function barrelSpecifier(relpath: string) {
	if (!relpath.startsWith(SRC_PREFIX)) return null

	const rest = relpath.slice(SRC_PREFIX.length)
	const segments = rest.split("/")

	if (segments.length === 1) {
		if (isIndexFile(rest)) return null
		const ext = SOURCE_EXTENSIONS.find((e) => rest.endsWith(e))
		return ext ? rest.slice(0, -ext.length) : null
	}

	if (segments.length === 2 && isIndexFile(rest)) return segments[0]!

	return null
}

function isIndexFile(relpath: string) {
	return SOURCE_EXTENSIONS.some((ext) => relpath.endsWith(`index${ext}`))
}

function normalize(relpath: string) {
	return relpath.replace(/\\/g, "/").replace(/^\.\//, "")
}
