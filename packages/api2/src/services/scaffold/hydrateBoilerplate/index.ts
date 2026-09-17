import { existsSync } from "node:fs"
import { extname, join } from "node:path"
import { pathOf, write } from "../ops"
import type { FsOp, Project, Unit } from "../types"

type UnitType = "astro" | "react" | "typescript"

const TEMPLATES = join(import.meta.dir, "templates")
const SOURCE = "hydrateBoilerplate"

// fills {{ KEY }} (with or without surrounding spaces) from kwargs.
// unknown keys are left untouched.
function fill(text: string, kwargs: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => kwargs[key] ?? whole)
}

// splits a template into { path, content } blocks.
// block shape:
//   ===
//   <relative path>
//   ===
//   <content...>
function parseTemplate(text: string): { path: string; content: string }[] {
  const lines = text.split("\n")
  const files: { path: string; content: string }[] = []
  let i = 0

  while (i < lines.length) {
    if (/^={3,}$/.test(lines[i]!.trim())) {
      const path = lines[i + 1]?.trim()
      i += 3 // skip ===, path, ===
      const buf: string[] = []
      while (i < lines.length && !/^={3,}$/.test(lines[i]!.trim())) {
        buf.push(lines[i]!)
        i++
      }
      if (path) files.push({ path, content: buf.join("\n").replace(/^\n+|\n+$/g, "") })
    } else {
      i++
    }
  }

  return files
}

function detectUnitType(unit: Unit): UnitType {
  const exts = new Set(unit.ops.map(pathOf).map((path) => (path ? extname(path) : "")))
  if (exts.has(".astro")) return "astro"
  if (exts.has(".tsx") || exts.has(".jsx")) {
    const WEB_APPS = [
      'web', 'web2'
    ]
    if (WEB_APPS.includes(unit.name)) {
      return 'react'
    }
    return 'react-peer'
  }
  return "typescript"
}

/** Every path the project already has an opinion about. */
function claimed(project: Project): Set<string> {
  const paths = new Set<string>()
  for (const unit of project.units) {
    for (const op of unit.ops) {
      const path = pathOf(op)
      if (path) paths.add(path)
    }
  }
  return paths
}

/**
 * Reads a template and hydrates each block into a write op. Anything already on
 * disk, or already claimed by the project's own ops, is left alone — boilerplate
 * never shadows authored code.
 */
async function template(
  name: string,
  baseDir: string,
  kwargs: Record<string, string>,
  taken: Set<string>,
): Promise<FsOp[]> {
  const text = await Bun.file(join(TEMPLATES, name)).text()
  const ops: FsOp[] = []

  for (const file of parseTemplate(text)) {
    const path = join(baseDir, fill(file.path, kwargs))
    if (taken.has(path) || existsSync(path)) continue
    ops.push(write(SOURCE, path, fill(file.content, kwargs)))
  }

  return ops
}

/**
 * Boilerplate a unit needs: its own template, plus the project's when the project
 * itself is new. Every unit asks for the project template and the identical write
 * ops fold into one, so it lands exactly once.
 */
export async function hydrateBoilerplate(project: Project, unit: Unit): Promise<FsOp[]> {
  const taken = claimed(project)
  const ops: FsOp[] = []

  if (project.isNew) {
    const kwargs = { PROJECT_NAME: project.name }
    ops.push(...(await template("typescript-monorepo.tpl", project.dir, kwargs, taken)))
  }

  if (unit.isNew) {
    const kwargs = { PROJECT_NAME: project.name, PACKAGE_NAME: unit.name }
    ops.push(...(await template(`${detectUnitType(unit)}.tpl`, unit.dir, kwargs, taken)))
  }

  return ops
}
