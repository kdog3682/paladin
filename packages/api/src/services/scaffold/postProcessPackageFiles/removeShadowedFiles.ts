import { existsSync } from "node:fs"
import { unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import logger from "../logger"
import type { PackageData } from "../types"

const SOURCE_EXTENSIONS = [".ts", ".tsx"]

/**
 * `foobar/index.ts` supersedes a flat `foobar.ts` — drop the old module so the
 * two don't resolve ambiguously.
 */
export async function removeShadowedFiles(pkg: PackageData) {
	const removed = new Set<string>()
	for (const file of pkg.files) {
		const dir = dirname(file.relpath)
		if (dir === "." || dir === "") continue
		const base = file.relpath.slice(dir.length + 1)
		if (!SOURCE_EXTENSIONS.some((ext) => base === `index${ext}`)) continue
		for (const ext of SOURCE_EXTENSIONS) {
			const shadowed = `${dir}${ext}`
			const abs = join(pkg.dir, shadowed)
			if (!existsSync(abs)) continue
			await unlink(abs)
			removed.add(shadowed)
			logger.warn("scaffold.shadowedFileRemoved", `deleted ${shadowed}`, {
				pkg: pkg.name,
				supersededBy: file.relpath,
				path: abs,
			})
		}
	}
	if (removed.size === 0) return
	pkg.files = pkg.files.filter((f) => !removed.has(f.relpath))
}
