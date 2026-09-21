import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { homedir } from "node:os"
import { collectImports } from "./ast/collectImports"

const PROJECTS = join(homedir(), "projects")
const EXTS = [".ts", ".tsx"]

function isFile(p: string): boolean {
    return existsSync(p) && statSync(p).isFile()
}

function probe(base: string): string | null {
    if (isFile(base)) return base
    for (const ext of EXTS) {
        if (isFile(base + ext)) return base + ext
    }
    for (const ext of EXTS) {
        const indexed = join(base, "index" + ext)
        if (isFile(indexed)) return indexed
    }
    return null
}

function resolveLocal(fromFile: string, source: string): string | null {
    const base = resolve(dirname(fromFile), source)
    // allow ./foo.js → ./foo.ts
    const rewritten = base.replace(/\.js$/, "")
    return probe(base) ?? probe(rewritten)
}

// /home/kdog3682/projects/mathpen/packages/manim/... → "mathpen"
function projectOf(file: string): string | null {
    if (!file.startsWith(PROJECTS + "/")) return null
    return file.slice(PROJECTS.length + 1).split("/")[0] ?? null
}

function entryOf(pkgRoot: string): string | null {
    const pkgJson = join(pkgRoot, "package.json")
    if (isFile(pkgJson)) {
        const json = JSON.parse(readFileSync(pkgJson, "utf8"))
        for (const field of [json.source, json.module, json.main]) {
            if (typeof field !== "string") continue
            const hit = probe(resolve(pkgRoot, field))
            if (hit) return hit
        }
    }
    return probe(join(pkgRoot, "src/index")) ?? probe(join(pkgRoot, "index"))
}

// @mathpen/manim → ~/projects/mathpen/packages/manim, only if the importing
// file lives inside that same project (contained in its own path)
function resolveWorkspace(fromFile: string, source: string): string | null {
    const match = /^@([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(source)
    if (!match) return null
    const [, project, pkg, subpath] = match
    if (projectOf(fromFile) !== project.toLowerCase()) return null

    const pkgRoot = join(PROJECTS, project.toLowerCase(), "packages", pkg.toLowerCase())
    if (!existsSync(pkgRoot)) return null
    if (subpath) return probe(join(pkgRoot, subpath)) ?? probe(join(pkgRoot, "src", subpath))
    return entryOf(pkgRoot)
}

export function fastDependencyList(file: string): string[] {
    const entry = resolve(file)
    const seen = new Set<string>()
    const out: string[] = []
    const stack = [entry]

    while (stack.length) {
        const current = stack.pop()!
        if (seen.has(current)) continue
        seen.add(current)
        if (current !== entry) out.push(current)
        if (!isFile(current)) continue

        for (const ref of collectImports(readFileSync(current, "utf8"))) {
            const next =
                ref.type === "local"
                    ? resolveLocal(current, ref.source)
                    : ref.type === "workspace"
                      ? resolveWorkspace(current, ref.source)
                      : null
            if (next && !seen.has(next)) stack.push(next)
        }
    }

    return out
}
