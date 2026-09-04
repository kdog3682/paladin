import { bash, mergeJson } from '@paladin/utils'
import { existsSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

// matches `mathpen-check <module>` or `mathpen-check [options]`
const USAGE_RE = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)+)(?=\s+[<[])/g

function findPackageJson(file: string) {
    let dir = dirname(resolve(file))
    while (true) {
        const path = join(dir, 'package.json')
        if (existsSync(path)) return path
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    throw new Error(`no package.json found above: ${file}`)
}

async function ensureShebang(file: string, text: string) {
    if (!text.startsWith('#!')) {
        await Bun.write(file, `#!/usr/bin/env bun\n${text}`)
    }
    await chmod(file, 0o755)
}

/**
 * adds `file` to the nearest package.json as a bin entry, then bun links it.
 * if `name` is omitted it is inferred from usage text inside the file.
 */
export async function registerBin(file: string, name?: string) {
    const target = resolve(file)
    if (!existsSync(target)) throw new Error(`file not found: ${target}`)

    const text = await Bun.file(target).text()

    if (!name) {
        const counts = new Map<string, number>()
        for (const [, match] of text.matchAll(USAGE_RE)) {
            counts.set(match, (counts.get(match) ?? 0) + 1)
        }
        let max = 0
        for (const [candidate, count] of counts) {
            if (count > max) {
                name = candidate
                max = count
            }
        }
        if (!name) throw new Error(`could not infer a bin name from: ${target}`)
    }

    const pkgPath = findPackageJson(target)
    const cwd = dirname(pkgPath)
    const entry = './' + relative(cwd, target)

    await ensureShebang(target, text)
    const pkg = await mergeJson(pkgPath, { bin: { [name]: entry } })
    await bash(['bun', 'link'], { cwd })

    return { bin: name, entry, pkgPath, pkg: pkg.name }
}
