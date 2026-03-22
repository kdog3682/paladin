// @paladin/scribe-api/src/lib/fuzzy.ts

import { db, schema } from "../db"
import { eq } from "drizzle-orm"
import { walkDir, safeRegex, type FileEntry } from "./file-tree"

export type ScoredResult = {
  item: FileEntry | { id: string, name: string, files: string[] }
  score: number
  kind: "group" | "package" | "directory" | "file"
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // exact match
  if (t === q) return 1000
  // starts with
  if (t.startsWith(q)) return 500
  // contains substring
  if (t.includes(q)) return 200

  // character-by-character fuzzy
  let qi = 0
  let consecutive = 0
  let maxConsecutive = 0
  let score = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      consecutive++
      maxConsecutive = Math.max(maxConsecutive, consecutive)
      score += 10 + consecutive * 5
    } else {
      consecutive = 0
    }
  }

  // all chars must match
  if (qi < q.length) return 0
  return score + maxConsecutive * 10
}

function kindBonus(kind: ScoredResult["kind"]): number {
  switch (kind) {
    case "group": return 300
    case "package": return 200
    case "directory": return 50
    case "file": return 0
  }
}

function flattenEntries(entries: FileEntry[]): FileEntry[] {
  const flat: FileEntry[] = []
  for (const e of entries) {
    flat.push(e)
    if (e.children) flat.push(...flattenEntries(e.children))
  }
  return flat
}

export async function fuzzySearch(query: string, limit = 50): Promise<ScoredResult[]> {
  if (!query.trim()) return []

  // load file groups
  const groups = await db.select().from(schema.fileGroups).all()

  // load source dirs + global filters
  const sourceDirs = await db.select().from(schema.sourceDirs).all()
  const visible = sourceDirs.filter((d) => d.visible)

  const globalRow = await db.query.globalFilters.findFirst({
    where: eq(schema.globalFilters.id, "singleton"),
  })
  const globalIncludeRe = safeRegex(globalRow?.include)
  const globalExcludeRe = safeRegex(globalRow?.exclude)

  // walk all visible dirs
  const allEntries: FileEntry[] = []
  for (const dir of visible) {
    const includeRe = safeRegex(dir.include)
    const excludeRe = safeRegex(dir.exclude)
    const tree = await walkDir(dir.path, includeRe, excludeRe, globalIncludeRe, globalExcludeRe)
    allEntries.push(...flattenEntries(tree))
  }

  const results: ScoredResult[] = []

  // score file groups
  for (const group of groups) {
    const score = fuzzyScore(query, group.name)
    if (score > 0) {
      results.push({ item: group, score: score + kindBonus("group"), kind: "group" })
    }
  }

  // score files and dirs
  for (const entry of allEntries) {
    const score = fuzzyScore(query, entry.name)
    if (score <= 0) continue

    const isPackage = entry.type === "directory" && entry.path.includes("/packages/")
    const kind = isPackage ? "package" : entry.type === "directory" ? "directory" : "file"
    results.push({ item: entry, score: score + kindBonus(kind), kind })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
