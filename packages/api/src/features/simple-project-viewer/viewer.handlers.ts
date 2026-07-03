// @paladin/api/features/simple-project-viewer/viewer.handlers.ts

import { readFile } from 'fs/promises'
import { join, extname } from 'path'
import { homedir } from 'os'
import { collectFiles } from '@paladin/utils/collectFiles'
import { clip } from '@paladin/utils/clip'

const PROJECTS_ROOT = join(homedir(), 'projects')

function pkgRoot(project: string, pkg: string) {
  return join(PROJECTS_ROOT, project, 'packages', pkg)
}

const marks = new Map<string, Set<string>>()

export const handlers = {
  'simple-project-viewer.tree': async ({ project, pkg }: { project: string; pkg: string }) => {
    const root = pkgRoot(project, pkg)
    const files = await collectFiles(root)
    return { files: files.sort() }
  },

  'simple-project-viewer.file': async ({ project, pkg, path }: { project: string; pkg: string; path: string }) => {
    const root = pkgRoot(project, pkg)
    const full = join(root, path)
    if (!full.startsWith(root)) throw new Error('invalid path')
    const content = await readFile(full, 'utf-8')
    return { content, ext: extname(full).slice(1) }
  },

  'simple-project-viewer.marks.list': ({ project, pkg }: { project: string; pkg: string }) => {
    return { marks: [...(marks.get(`${project}/${pkg}`) ?? [])] }
  },

  'simple-project-viewer.marks.toggle': ({ project, pkg, path }: { project: string; pkg: string; path: string }) => {
    const key = `${project}/${pkg}`
    const set = marks.get(key) ?? new Set<string>()
    set.has(path) ? set.delete(path) : set.add(path)
    marks.set(key, set)
    return { marks: [...set] }
  },

  'simple-project-viewer.export': async ({ project, pkg, paths }: { project: string; pkg: string; paths: string[] }) => {
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
    const outPath = await clip(joined)
    marks.delete(`${project}/${pkg}`)
    return { path: outPath, count: parts.length }
  },
}
