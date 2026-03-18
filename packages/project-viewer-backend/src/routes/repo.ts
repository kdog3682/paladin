// @paladin/project-viewer-backend/src/routes/repo.ts
import { Hono } from "hono"
import { ensureRepo, repoDir } from "../lib/clone"
import { walk, readContent, categorize, type FlatFile } from "../lib/walk"
import { grep, applyGreps, type GrepResult } from "../lib/grep"

export const repo = new Hono()

// parse "org/repo" or full github url
function parseTarget(input: string): { org: string, name: string, sub?: string } | null {
  // full url: https://github.com/org/repo/tree/branch/path/to/dir
  const urlMatch = input.match(
    /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+\/?(.*)?)?/
  )
  if (urlMatch) {
    return {
      org: urlMatch[1],
      name: urlMatch[2],
      sub: urlMatch[3] || undefined,
    }
  }

  // org/repo
  const parts = input.split("/")
  if (parts.length >= 2) {
    return { org: parts[0], name: parts[1] }
  }

  return null
}

// POST /repo/load  { target: "org/repo" | url }
repo.post("/load", async (c) => {
  const body = await c.req.json<{ target: string }>()
  const parsed = parseTarget(body.target)
  if (!parsed) return c.json({ error: "invalid target" }, 400)

  const dir = await ensureRepo(parsed.org, parsed.name)
  const { tree, flat } = await walk(dir, parsed.sub)

  const categories: Record<string, number> = {}
  for (const f of flat) {
    categories[f.category] = (categories[f.category] || 0) + 1
  }

  return c.json({
    org: parsed.org,
    name: parsed.name,
    sub: parsed.sub,
    root: dir,
    tree,
    flat,
    total: flat.length,
    categories,
  })
})

// POST /repo/file  { org, name, path }
repo.post("/file", async (c) => {
  const body = await c.req.json<{ org: string, name: string, path: string }>()
  const dir = repoDir(body.org, body.name)
  const content = await readContent(dir, body.path)
  return c.json({ path: body.path, content })
})

// POST /repo/grep  { org, name, pattern, paths }
repo.post("/grep", async (c) => {
  const body = await c.req.json<{
    org: string
    name: string
    pattern: string
    paths: string[]
  }>()
  const dir = repoDir(body.org, body.name)
  const result = await grep(dir, body.pattern, body.paths)
  return c.json(result)
})
