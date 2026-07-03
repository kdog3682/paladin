import { Hono } from 'hono'
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join, relative, extname } from 'path'
import { homedir } from 'os'

const app = new Hono()
const PROJECTS_ROOT = join(homedir(), 'projects')

async function walk(dir: string, base: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full, base)))
    else files.push(relative(base, full))
  }
  return files
}

function pkgRoot(project: string, pkg: string) {
  return join(PROJECTS_ROOT, project, 'packages', pkg)
}

app.get('/tree', async (c) => {
  const project = c.req.query('project')
  const pkg = c.req.query('pkg')
  if (!project || !pkg) return c.json({ error: 'project and pkg required' }, 400)
  const root = pkgRoot(project, pkg)
  try {
    const files = await walk(root, root)
    return c.json({ files: files.sort() })
  } catch {
    return c.json({ error: 'not found' }, 404)
  }
})

app.get('/file', async (c) => {
  const project = c.req.query('project')
  const pkg = c.req.query('pkg')
  const path = c.req.query('path')
  if (!project || !pkg || !path) return c.json({ error: 'project, pkg, path required' }, 400)
  const root = pkgRoot(project, pkg)
  const full = join(root, path)
  if (!full.startsWith(root)) return c.json({ error: 'invalid path' }, 400)
  try {
    const content = await readFile(full, 'utf-8')
    return c.json({ content, ext: extname(full).slice(1) })
  } catch {
    return c.json({ error: 'not found' }, 404)
  }
})

// in-memory marks, keyed by "project/pkg"
const marks = new Map<string, Set<string>>()

app.get('/marks', (c) => {
  const key = `${c.req.query('project')}/${c.req.query('pkg')}`
  return c.json({ marks: [...(marks.get(key) ?? [])] })
})

app.post('/marks', async (c) => {
  const { project, pkg, path } = await c.req.json()
  const key = `${project}/${pkg}`
  const set = marks.get(key) ?? new Set<string>()
  set.has(path) ? set.delete(path) : set.add(path)
  marks.set(key, set)
  return c.json({ marks: [...set] })
})

app.post('/export', async (c) => {
  const { project, pkg, paths } = await c.req.json<{ project: string; pkg: string; paths: string[] }>()
  if (!project || !pkg || !paths?.length) return c.json({ error: 'project, pkg, paths required' }, 400)
  const root = pkgRoot(project, pkg)
  const parts: string[] = []
  for (const p of paths) {
    const full = join(root, p)
    if (!full.startsWith(root)) continue
    try {
      const content = await readFile(full, 'utf-8')
      const firstLine = content.split('\n', 1)[0] ?? ''
      const hasPathComment = firstLine.trim().startsWith('//') && firstLine.includes(p)
      const header = hasPathComment ? '' : `// @${project}/${pkg}/${p}\n`
      parts.push(header + content)
    } catch {
      // skip unreadable files
    }
  }
  const joined = parts.join('\n\n')
  const scratchDir = join(homedir(), 'scratch')
  await mkdir(scratchDir, { recursive: true })
  const outPath = join(scratchDir, 'temp-content.txt')
  await writeFile(outPath, joined, 'utf-8')
  Bun.spawn(['python3', '-c', `import webbrowser; webbrowser.open('file://${outPath}')`])
  marks.delete(`${project}/${pkg}`)
  return c.json({ path: outPath, count: parts.length })
})

export default app
