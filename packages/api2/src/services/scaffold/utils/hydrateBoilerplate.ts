import { join, extname } from 'path'
import { existsSync } from 'fs'
import type { File, Project } from '../types'

type UnitType = 'astro' | 'react' | 'typescript'

const TEMPLATES = join(import.meta.dir, '..', 'templates')

// fills {{ KEY }} (with or without surrounding spaces) from kwargs.
// unknown keys are left untouched.
function fill(text: string, kwargs: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => (key in kwargs ? kwargs[key] : whole))
}

// splits a template into { path, content } blocks.
// block shape:
//   ===
//   <relative path>
//   ===
//   <content...>
function parseTemplate(text: string): { path: string; content: string }[] {
  const lines = text.split('\n')
  const files: { path: string; content: string }[] = []
  let i = 0

  while (i < lines.length) {
    if (/^={3,}$/.test(lines[i].trim())) {
      const path = lines[i + 1]?.trim()
      i += 3 // skip ===, path, ===
      const buf: string[] = []
      while (i < lines.length && !/^={3,}$/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      if (path) files.push({ path, content: buf.join('\n').replace(/^\n+|\n+$/g, '') })
    } else {
      i++
    }
  }

  return files
}

function detectUnitType(files: File[]): UnitType {
  const exts = new Set(files.map((f) => extname(f.path)))
  if (exts.has('.astro')) return 'astro'
  if (exts.has('.tsx') || exts.has('.jsx')) return 'react'
  return 'typescript'
}

// reads a template, hydrates each block, and writes the files under baseDir.
// existing files (e.g. a package.json the project already presented) are never
// overwritten. returns the absolute paths written.
async function apply(
  template: string,
  baseDir: string,
  kwargs: Record<string, string>,
): Promise<string[]> {
  const text = await Bun.file(join(TEMPLATES, template)).text()
  const written: string[] = []

  for (const file of parseTemplate(text)) {
    const out = join(baseDir, fill(file.path, kwargs))
    if (existsSync(out)) continue
    await Bun.write(out, fill(file.content, kwargs))
    written.push(out)
  }

  return written
}

/**
 * Lays down boilerplate for a new project and any new units, picking the template
 * from the files each unit contains. Run this after the project's own files are on
 * disk so nothing it authored gets shadowed by a template. Returns the paths written.
 */
export async function hydrateBoilerplate(project: Project): Promise<string[]> {
  const written: string[] = []

  if (project.isNew) {
    written.push(...(await apply('typescript-monorepo.tpl', project.dir, { PROJECT_NAME: project.name })))
  }

  for (const unit of project.units) {
    if (!unit.isNew) continue
    written.push(
      ...(await apply(`${detectUnitType(unit.files)}.tpl`, unit.dir, {
        PROJECT_NAME: project.name,
        PACKAGE_NAME: unit.name,
      })),
    )
  }

  return written
}
