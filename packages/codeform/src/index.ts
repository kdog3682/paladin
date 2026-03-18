// @paladin/packages/codeform/index.ts

import { resolve, join, dirname } from "path"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { $ } from "bun"
import { FileCache } from "./cache"
import { document } from "./documenter"
import { format } from "./formatter"
import type { FileDoc } from "./documenter.types"

async function findTargets(dir: string): Promise<string[]> {
  const result = await $`grep -rl "/\*\*" ${dir} --include="*.ts"`.text()
  return result.trim().split("\n").filter(Boolean)
}

function resolveImportPath(from: string, source: string): string | null {
  if (!source.startsWith(".")) return null
  const dir = dirname(from)
  const base = join(dir, source)
  const candidates = [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"]
  return candidates.find(c => existsSync(c)) ?? null
}

function discoverDeps(targets: string[]): string[] {
  const seen = new Set(targets)
  const queue = [...targets]
  while (queue.length) {
    const filepath = queue.pop()!
    const content = readFileSync(filepath, "utf-8")
    const imports = [...content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
    for (const [, source] of imports) {
      const resolved = resolveImportPath(filepath, source)
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved)
        queue.push(resolved)
      }
    }
  }
  return [...seen]
}

export async function generate(dir: string): Promise<string> {
  const root = resolve(dir)

  const hashedRoot = Bun.hash(root)
  const cache = new FileCache<FileDoc>(`~/.cache/paladin/codeform/${hashedRoot}cache.json`)
  await cache.load()

  const targets = await findTargets(root)
  const all = discoverDeps(targets)
  const result = await document(root, all, cache)

  await cache.save()
  return format(result)
}

export { document } from "./documenter"
export { format } from "./formatter"
export { FileCache } from "./cache"
export type * from "./documenter.types"

// const spec = await generate("/home/kdog3682/projects/paladin/packages/codeform/")
// console.log(spec)

// const spec = await generate("/home/kdog3682/projects/paladin/packages/conversation")
// writeFileSync('/tmp/abc.ts', spec)
