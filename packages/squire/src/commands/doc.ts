// @paladin/squire/src/commands/doc.ts
import { join, basename } from "path"
import { mkdirSync } from "fs"
import { tempwrite } from "@paladin/utils/tempwrite"
import { formatGrid } from "../shell/grid"
import type { Command } from "../handler"

interface FileEntry {
  path: string
  base: string
  mtime: number
}

async function collectFiles(dir: string): Promise<FileEntry[]> {
  const glob = new Bun.Glob("**/*.{ts,tsx,md}")
  const entries: FileEntry[] = []

  for await (const match of glob.scan({ cwd: dir, onlyFiles: true })) {
    const full = join(dir, match)
    const stat = await Bun.file(full).stat()
    entries.push({
      path: full,
      base: basename(match),
      mtime: stat?.mtimeMs ?? 0,
    })
  }

  return entries
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  let hi = 0
  for (let ni = 0; ni < needle.length; ni++) {
    const ch = needle[ni]
    while (hi < haystack.length && haystack[hi] !== ch) hi++
    if (hi >= haystack.length) return false
    hi++
  }
  return true
}

function findBestMatch(entries: FileEntry[], query: string): FileEntry | null {
  const q = query.toLowerCase()
  const withExt = q.endsWith(".ts") || q.endsWith(".tsx") || q.endsWith(".md") ? q : null

  const exact = entries
    .filter(e => {
      const b = e.base.toLowerCase()
      const stripped = b.replace(/^[_\-.]/, "")
      return b === q || b === `${q}.ts` || b === `${q}.tsx` || b === `${q}.md`
        || stripped === `${q}.ts` || stripped === `${q}.tsx` || stripped === `${q}.md`
        || (withExt && (b === withExt || stripped === withExt))
    })
    .sort((a, b) => b.mtime - a.mtime)

  if (exact.length > 0) return exact[0]

  const fuzzy = entries
    .filter(e => {
      const name = e.base.toLowerCase().replace(/^[_\-.]/, "").replace(/\.\w+$/, "")
      return fuzzyMatch(q, name)
    })
    .sort((a, b) => b.mtime - a.mtime)

  return fuzzy[0] ?? null
}

function ensureDocsDir(pkgDir: string): string {
  const docsDir = join(pkgDir, "docs")
  mkdirSync(docsDir, { recursive: true })
  return docsDir
}

async function listDocFiles(docsDir: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*")
  const files: string[] = []

  for await (const match of glob.scan({ cwd: docsDir, onlyFiles: true })) {
    files.push(match)
  }

  return files.sort()
}

function printDocList(ctx: any, files: string[]) {
  if (files.length === 0) {
    ctx.reporter.info("docs/: (empty)")
    return
  }
  console.log(formatGrid(files.map(f => basename(f))))
}

// TODO: implement doc generation
async function createDoc(_pkgDir: string, _name: string): Promise<string> {
  return "# generated doc\n"
}

export const docCommand: Command = {
  name: "doc",
  description: "doc — open all. doc add/remove <names>. doc list. doc create <name>",
  requiresPkg: true,
  handler: async ({ raw, tokens }, ctx) => {
    const pkgDir = ctx.state.pkgDir!
    const docsDir = ensureDocsDir(pkgDir)
    const input = raw.trim()

    if (!input) {
      const files = await listDocFiles(docsDir)
      if (files.length === 0) {
        ctx.reporter.warn("docs/ is empty — use 'doc add <name>' to add files")
        return
      }

      const parts: string[] = []
      for (const file of files) {
        const content = await Bun.file(join(docsDir, file)).text()
        parts.push(content)
      }

      await tempwrite(parts.join("\n----\n"))
      ctx.reporter.success(`opened ${files.length} doc(s)`)
      printDocList(ctx, files)
      return
    }

    if (input === "list") {
      const files = await listDocFiles(docsDir)
      printDocList(ctx, files)
      return
    }

    if (input.startsWith("create ")) {
      const name = input.slice(7).trim()
      if (!name) {
        ctx.reporter.warn("usage: doc create <name>")
        return
      }
      const dest = join(docsDir, `${name}.md`)
      const content = await createDoc(pkgDir, name)
      await Bun.write(dest, content)
      ctx.reporter.success(`created ${name}.md`)
      printDocList(ctx, await listDocFiles(docsDir))
      return
    }

    if (input.startsWith("add ")) {
      const names = input.slice(4).trim().split(/\s+/)
      const entries = await collectFiles(pkgDir)
      let added = 0

      for (const name of names) {
        const found = findBestMatch(entries, name)
        if (!found) {
          ctx.reporter.warn(`no match for '${name}'`)
          const glob = new Bun.Glob("**/*.{ts,tsx}")
          const allFiles: string[] = []
          for await (const match of glob.scan({ cwd: pkgDir, onlyFiles: true })) {
            allFiles.push(match)
          }
          allFiles.sort()
          console.log(formatGrid(allFiles))
          continue
        }
        const content = await Bun.file(found.path).text()
        const destName = /\.tsx?$/.test(found.base) ? `${found.base}.md` : found.base
        const dest = join(docsDir, destName)
        await Bun.write(dest, content)
        ctx.reporter.success(`added ${destName}`)
        added++
      }

      if (added > 0) printDocList(ctx, await listDocFiles(docsDir))
      return
    }

    if (input.startsWith("remove ")) {
      const names = input.slice(7).trim().split(/\s+/)
      const docFiles = await listDocFiles(docsDir)
      let removed = 0

      for (const name of names) {
        const q = name.toLowerCase()
        const match = docFiles.find(f => {
          const b = basename(f).toLowerCase()
          return b === q || b.startsWith(`${q}.`) || b === `${q}.md`
        })

        if (!match) {
          ctx.reporter.warn(`'${name}' not in docs/`)
          continue
        }

        const { unlinkSync } = require("fs")
        unlinkSync(join(docsDir, match))
        ctx.reporter.success(`removed ${basename(match)}`)
        removed++
      }

      if (removed > 0) printDocList(ctx, await listDocFiles(docsDir))
      return
    }

    const entries = await collectFiles(pkgDir)
    const queries = input.split(/\s+/)
    const matched: FileEntry[] = []

    for (const q of queries) {
      const found = findBestMatch(entries, q)
      if (found) {
        if (!matched.some(m => m.path === found.path)) {
          matched.push(found)
        }
      } else {
        ctx.reporter.warn(`no match for '${q}'`)
      }
    }

    if (matched.length === 0) return

    const parts: string[] = []
    for (const entry of matched) {
      const content = await Bun.file(entry.path).text()
      parts.push(content)
    }

    await tempwrite(parts.join("\n----\n"))
    ctx.reporter.success(`opened ${matched.length} file(s): ${matched.map(m => m.base).join(", ")}`)
  },
}