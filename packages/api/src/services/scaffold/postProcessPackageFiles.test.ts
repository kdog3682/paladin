import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { postProcessPackageFiles } from "./postProcessPackageFiles"
import type { FileEntry, PackageData } from "./types"

let dir: string

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "scaffold-"))
})

afterEach(async () => {
	await rm(dir, { recursive: true, force: true })
})

async function makePackage(name: string, relpaths: string[]): Promise<PackageData> {
	const files: FileEntry[] = []

	for (const relpath of relpaths) {
		const path = join(dir, relpath)
		await mkdir(dirname(path), { recursive: true })
		await writeFile(path, "", "utf8")
		files.push({ path, relpath, content: "" })
	}

	return { name, isNew: true, files, dir, deps: {}, devDeps: {} }
}

const barrel = () => readFile(join(dir, "src/index.ts"), "utf8")

test("barrels top level modules and folder modules", async () => {
	const pkg = await makePackage("utils", ["src/sleep.ts", "src/format/index.ts", "src/format/date.ts"])

	await postProcessPackageFiles(pkg)

	const lines = (await barrel()).trim().split("\n").sort()
	expect(lines).toEqual([`export * from "./format"`, `export * from "./sleep"`])
})

test("deletes a flat module superseded by a folder module", async () => {
	const pkg = await makePackage("utils", ["src/foobar.ts", "src/foobar/index.ts"])

	await postProcessPackageFiles(pkg)

	expect(existsSync(join(dir, "src/foobar.ts"))).toBe(false)
	expect(pkg.files.map((f) => f.relpath)).not.toContain("src/foobar.ts")
	expect((await barrel()).trim()).toBe(`export * from "./foobar"`)
})

test("skips the barrel for other packages", async () => {
	const pkg = await makePackage("api", ["src/server.ts"])

	await postProcessPackageFiles(pkg)

	expect(existsSync(join(dir, "src/index.ts"))).toBe(false)
})
