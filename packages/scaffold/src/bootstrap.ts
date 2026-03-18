// @paladin/scaffold/bootstrap.ts
//
// templates are flat text files stored in ~/.local/share/paladin/templates/
// each file contains multiple entries separated by a marker line, alternating
// between relative path and file content. org names are replaced with {{ORG}}
// so templates are reusable across projects.

import { readdir, readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join, relative, dirname } from "path"
import { homedir } from "os"

const SEP = "=".repeat(64)
const TOKEN = "{{ORG}}"
const PACKAGE_TOKEN = "{{PACKAGE_NAME}}"
const XDG = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
const TEMPLATE_DIR = join(XDG, "paladin", "templates")

const DEFAULT_EXCLUDE = [
    /node_modules/,
    /\.next/,
    /dist/,
    /\.turbo/,
    /\.env/,
    /\.git$/,
    /\.gitignore/,
    /(__pycache__|\.pyc$|\.pyo$|\.egg-info)/,
    /\.(venv|mypy_cache|pytest_cache|ruff_cache|DS_Store)/,
    /\.lock(b)?$/,
]

// --- bootstrap ---

export interface BootstrapParams {
    /** target directory to bootstrap into */
    dir: string
    /** org name (without @) used for manifest naming and template hydration */
    org: string
    /** package name — omit for root-level bootstrap */
    pkg?: string
    /** template key — if missing or template doesn't exist, falls back to minimal manifest */
    key?: string
}

export async function bootstrap({ dir, org, pkg, key }: BootstrapParams) {
    const template = key ? join(TEMPLATE_DIR, `${key}.txt`) : null

    // hydrate from template if available
    if (template && existsSync(template)) {
        await hydrate(dir, template, org, pkg)
        return
    }

    if (key) console.log(`template "${key}" not found, creating minimal manifest`)

    // fall back to a minimal package.json
    await mkdir(dir, { recursive: true })

    const manifest = pkg
        ? {
            name: `@${org}/${pkg}`,
            version: "0.1.0",
            scripts: { dev: "bun run --watch src/index.ts", test: "bun test" },
        }
        : {
            name: org,
            private: true,
            workspaces: ["packages/*", "apps/*"],
            scripts: { dev: "bun run --filter '*' dev", test: "bun run --filter '*' test" },
        }

    await writeFile(join(dir, "package.json"), JSON.stringify(manifest, null, 2))
}

/** expand a template file into a directory, replacing {{ORG}} with the real org name */
async function hydrate(root: string, template: string, org: string, pkg?: string) {
    const raw = await readFile(template, "utf-8")
    const parts = raw.split(SEP).map(s => s.trim()).filter(Boolean)
    const sub = (s: string, pattern, replacement) => replacement ? s.replaceAll(pattern, replacement) : s
    const written: string[] = []

    for (let i = 0; i < parts.length - 1; i += 2) {
        const rel = sub(parts[i])
        const text = sub(sub(parts[i + 1], TOKEN, org), PACKAGE_TOKEN, pkg)
        const dest = join(root, rel)
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, text)
        written.push(rel)
    }

    console.log(`bootstrapped ${root} from template (${written.length} files)`)
}

// --- create template ---

export interface CreateTemplateParams {
    /** source directory to capture files from */
    dir: string
    /** template key name — used as the filename in the template store */
    key: string
    /** org name to replace with {{ORG}} token for reusability */
    org?: string
    /** specific filenames to include — if set, only these are captured */
    files?: string[]
    /** additional exclude patterns, merged with defaults. strings are converted to RegExp */
    exclude?: (RegExp | string)[]
    /** "paths" to list files only, "content" to show file contents, falsy to write */
    dryrun?: "paths" | "content" | false
}

/** capture files from a directory into a reusable template */
export async function createTemplate({ dir, key, org, files, exclude, dryrun }: CreateTemplateParams) {
    if (!existsSync(dir)) {
        console.log(`skipping "${key}": ${dir} does not exist`)
        return null
    }

    const patterns = [
        ...DEFAULT_EXCLUDE,
        ...(exclude ?? []).map(e => typeof e === "string" ? new RegExp(e) : e),
    ]

    const captured = files
        ? await pickFiles(dir, files)
        : await walk(dir, patterns)

    if (!captured.length) {
        console.log(`skipping "${key}": no files found in ${dir}`)
        return null
    }

    if (dryrun) {
        console.log(`\n[dryrun] template "${key}" from ${dir}:`)
        for (const { rel, text } of captured) {
            console.log(`  ${rel}`)
            if (dryrun === "content") {
                console.log("  ---")
                console.log(text.split("\n").map(l => `  ${l}`).join("\n"))
                console.log()
            }
        }
        return null
    }

    const parts = captured.map(({ rel, text }) => {
        const content = org ? text.replaceAll(org, TOKEN) : text
        return `${SEP}\n${rel}\n${SEP}\n${content}`
    })

    const dest = join(TEMPLATE_DIR, `${key}.txt`)
    await mkdir(TEMPLATE_DIR, { recursive: true })
    await writeFile(dest, parts.join("\n"))
    console.log(parts.join('\n'))
    console.log(`created template "${key}" (${captured.length} files) → ${dest}`)
    return dest
}

// --- file collection helpers ---

async function pickFiles(dir: string, names: string[]): Promise<{ rel: string, text: string }[]> {
    const results: { rel: string, text: string }[] = []
    for (const name of names) {
        const text = await readFile(join(dir, name), "utf-8").catch(() => null)
        if (text !== null) results.push({ rel: name, text })
        else console.log(`  skipping ${name}: not found`)
    }
    return results
}

async function walk(dir: string, patterns: RegExp[], base = dir): Promise<{ rel: string, text: string }[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const results: { rel: string, text: string }[] = []
    for (const entry of entries) {
        const full = join(dir, entry.name)
        const rel = relative(base, full)
        if (patterns.some(p => p.test(rel))) continue
        if (entry.isDirectory()) {
            results.push(...await walk(full, patterns, base))
            continue
        }
        const text = await readFile(full, "utf-8").catch(() => null)
        if (text !== null) results.push({ rel, text })
    }
    return results
}

// --- cli: create templates from an existing monorepo ---
//
// usage: bun run bootstrap.ts /path/to/monorepo @orgname
//
// creates templates for the root (config files only) and for each
// workspace package that matches a bootstrapRef key.

const PROCEED = false
if (import.meta.main && PROCEED) {
    const root = join(homedir(), "projects", "paladin")
    const org = "@paladin"
    const dryrun: "paths" | "content" | false = "paths"

    // root template — just the config files that define the monorepo
    // await createTemplate({
    //   dir: root,
    //   key: "typescript-monorepo-root",
    //   org,
    //   dryrun,
    //   files: [
    //   'tsconfig.json', 'package.json'
    //   ],
    // })

    const exclude = ['/components/', '/lib/', 'hooks', '/stores/', '/store/']
    await createTemplate({
        dir: join(root, 'packages/web'),
        key: "typescript-monorepo-root",
        org,
        // dryrun,
        exclude: ['/components/']
    })

    // package templates — full directory walk per ref
    const refs: Record<string, string> = {
        // web: "packages/web",
        // api: "packages/api",
        // ui: "packages/ui",
    }

    for (const [key, rel] of Object.entries(refs)) {
        continue
        await createTemplate({
            dir: join(root, rel),
            key,
            org,
            dryrun,
            exclude: ['/src/']
        })
    }

    console.log("\ndone")
}


// ~/.local/share/paladin/templates/web.txt
// ~/.local/share/paladin/templates/python-root.txt
// ~/.local/share/paladin/templates/typescript-monorepo-root.txt
