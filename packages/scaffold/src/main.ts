// @paladin/scaffold/main.ts
import { watch } from "fs"
import { mkdir, readFile, stat, writeFile } from "fs/promises"
import { basename, dirname, extname, join } from "path"
import { homedir } from "os"
import { scaffold } from "./scaffold"

const WATCH_DIR = join(homedir(), "scratch")
const PALADIN_ROOT = "/home/kdog3682/projects/paladin"
const PATH_PREFIX = "@paladin/"

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

function timestamp() {
    return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}


async function waitForStable(path: string, { interval = 50, timeout = 2000 } = {}) {
    let lastSize = -1
    const start = Date.now()
    while (Date.now() - start < timeout) {
        try {
            const s = await stat(path)
            if (s.size > 0 && s.size === lastSize) return
            lastSize = s.size
        } catch { }
        await Bun.sleep(interval)
    }
}

function extractPathHeader(content: string): string | null {
    const withoutShebang = content.replace(/^#![^\n]*\n/, "")
    const firstLine = withoutShebang.split("\n", 1)[0]?.trim() ?? ""
    if (!firstLine) return null

    const slashMatch = firstLine.match(/^\/\/\s*(.+?)\s*$/)
    if (slashMatch) return slashMatch[1].trim()

    const htmlMatch = firstLine.match(/^<!--\s*(.+?)\s*(?:-->|>)?\s*$/)
    if (htmlMatch) return htmlMatch[1].trim()

    return null
}

function hasExtension(segment: string): boolean {
    return extname(segment) !== ""
}

function isPackageRootConfig(pathInPkg: string): boolean {
    const name = basename(pathInPkg)
    return /\.config\.[^.]+$/.test(name) || /^tsconfig(?:\..+)?\.json$/.test(name)
}

function resolveIncomingPath(rawHeader: string): string | null {
    const normalized = rawHeader.trim()
    if (!normalized) return null

    const rel = normalized.startsWith(PATH_PREFIX)
        ? normalized.slice(PATH_PREFIX.length)
        : normalized
    if (!rel) return PALADIN_ROOT

    const parts = rel.split("/").filter(Boolean)
    if (!parts.length) return PALADIN_ROOT

    if (parts[0] === "docs") {
        return join(PALADIN_ROOT, rel)
    }

    if (parts[0] === "packages") {
        const pkg = parts[1]
        const rest = parts.slice(2).join("/")
        if (!pkg) return null
        if (!rest) return join(PALADIN_ROOT, "packages", pkg)
        if (rest.startsWith("src/") || isPackageRootConfig(rest)) {
            return join(PALADIN_ROOT, "packages", pkg, rest)
        }
        return join(PALADIN_ROOT, "packages", pkg, "src", rest)
    }

    if (hasExtension(parts[0])) {
        return join(PALADIN_ROOT, rel)
    }

    const pkg = parts[0]
    const rest = parts.slice(1).join("/")
    if (!rest) return join(PALADIN_ROOT, "packages", pkg)
    if (rest.startsWith("src/") || isPackageRootConfig(rest)) {
        return join(PALADIN_ROOT, "packages", pkg, rest)
    }
    return join(PALADIN_ROOT, "packages", pkg, "src", rest)
}

async function handleIncomingFile(filepath: string): Promise<boolean> {
    if (!filepath.endsWith(".ts") && !filepath.endsWith(".md")) return false

    const content = await readFile(filepath, "utf-8")
    const header = extractPathHeader(content)
    if (!header) {
        console.log(`could not extract path header from ${filepath}`)
        return true
    }

    const resolved = resolveIncomingPath(header)
    if (!resolved) {
        console.log(`could not resolve path from header "${header}"`)
        return true
    }

    await mkdir(dirname(resolved), { recursive: true })
    await writeFile(resolved, content, "utf-8")
    console.log(`wrote ${resolved}`)
    return true
}


watch(WATCH_DIR, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (filename.endsWith(".crdownload")) return
    const filepath = join(WATCH_DIR, filename)
    await waitForStable(filepath)

    console.log('Processing:', filename)

    try {
        const handled = await handleIncomingFile(filepath)
        if (handled) return

        if (!filename.endsWith(".json")) return

        const raw = await readFile(filepath, "utf-8")
        const conversation = JSON.parse(raw)
        console.log('top-level keys:', Object.keys(conversation))
        const artifacts = conversation.artifacts ?? []
        console.log('artifacts:', JSON.stringify(artifacts))
        if (!artifacts.length) return
        console.log('calling scaffold...')
        const result = await scaffold(artifacts)
        console.log('scaffold result:', JSON.stringify(result, null, 2))
        const root = result.projectRoot
        const files = result.files.map((f: string) => `  ${f.replace(root + "/", "")}`).join("\n")
        console.log(`scaffolded → ${root}\n${files}`)
    }
    catch (e) {
        console.log('ERROR', e)
    }
})

console.log(`---\n${timestamp()}: WATCHING ${WATCH_DIR}\n---`)
