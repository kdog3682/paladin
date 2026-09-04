import { Glob } from "bun"
import { extname, isAbsolute, resolve } from "node:path"
import * as recast from "recast"

type SpecArgs = {
    /* directory (or directories) to walk, recursively */
    dir: string | string[]
    /* glob pattern relative to each dir. defaults to all js/ts files */
    glob?: string
    /* skip writing to disk. can be forced on with --dry */
    dry?: boolean
    /* merged over DEFAULT_PRINT and passed to recast.print */
    print?: recast.Options
}

/**
 * the contract a spec module must satisfy. specs are duck-typed against this —
 * they never import from the runner
 */
type Spec = {
    args: SpecArgs
    /* mutate the ast in place, return how many edits were made */
    transform: (ast: any) => number
}

const DEFAULT_GLOB = "**/*.{ts,tsx,js,jsx,mts,cts}"

const DEFAULT_PRINT: recast.Options = {
    quote: "double",
    trailingComma: true,
    objectCurlySpacing: true,
    arrowParensAlways: true,
}

const parsers = new Map<string, any>()

/**
 * picks a recast parser off the file extension. the typescript parser also
 * handles plain js, so it is the fallback for anything unrecognized
 */
async function parserFor(path: string) {
    const ext = extname(path)
    const name = ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs" ? "babel" : "typescript"

    if (!parsers.has(name)) {
        const mod = name === "babel" ? await import("recast/parsers/babel") : await import("recast/parsers/typescript")
        parsers.set(name, mod.default)
    }

    return parsers.get(name)
}

async function loadSpec(specPath: string): Promise<Spec> {
    const abs = isAbsolute(specPath) ? specPath : resolve(process.cwd(), specPath)
    const mod = await import(abs)

    if (typeof mod.transform !== "function") {
        throw new Error(`${specPath} does not export a transform function`)
    }
    if (!mod.args?.dir) {
        throw new Error(`${specPath} does not export an args object with a dir`)
    }

    return mod as Spec
}

async function main() {
    const argv = Bun.argv.slice(2)
    const specPath = argv.find((a) => !a.startsWith("-"))
    const forceDry = argv.includes("--dry") || argv.includes("-d")

    if (!specPath) {
        console.error("usage: bun run @paladin/recast/runner.ts <spec> [--dry]")
        process.exit(1)
    }

    const spec = await loadSpec(specPath)
    const { args } = spec

    const dirs = Array.isArray(args.dir) ? args.dir : [args.dir]
    const glob = new Glob(args.glob ?? DEFAULT_GLOB)
    const dry = forceDry || args.dry === true

    let scanned = 0
    let changed = 0
    let edits = 0
    const failed: { path: string, error: string }[] = []

    for (const dir of dirs) {
        for await (const path of glob.scan({ cwd: resolve(dir), absolute: true })) {
            if (path.includes("/node_modules/")) continue
            scanned += 1

            const before = await Bun.file(path).text()

            try {
                const ast = recast.parse(before, { parser: await parserFor(path) })
                const count = spec.transform(ast)
                if (!count) continue

                const after = recast.print(ast, { ...DEFAULT_PRINT, ...args.print }).code
                if (after === before) continue

                if (!dry) await Bun.write(path, after)
                changed += 1
                edits += count
                console.log(`${dry ? "would fix" : "fixed"}  ${path}  (${count})`)
            } catch (e) {
                failed.push({ path, error: e instanceof Error ? e.message : String(e) })
            }
        }
    }

    console.log("")
    console.log(`spec     ${specPath}`)
    console.log(`scanned  ${scanned}`)
    console.log(`${dry ? "would change" : "changed"}  ${changed} file(s), ${edits} edit(s)`)

    if (failed.length) {
        console.log(`failed   ${failed.length}`)
        failed.forEach((f) => console.log(`  ${f.path}\n    ${f.error}`))
    }

    if (dry) console.log("\ndry run — nothing written. drop --dry to apply.")
}

await main()
