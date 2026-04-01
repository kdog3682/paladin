// @paladin/conversation-processor/bootstrap/index.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import type { IncomingFile, FileOp } from "../types"

const TEMPLATES_DIR = join(import.meta.dir, "templates")
const PROJECT_TOKEN = "{{PROJECT_NAME}}"
const PACKAGE_TOKEN = "{{PACKAGE_NAME}}"

const FRAMEWORK_MAP: Record<string, string> = {
  astro: "astro",
  next: "next",
  "next/server": "next",
  hono: "hono",
  react: "react",
  svelte: "svelte",
  solid: "solid",
  vue: "vue",
}

export function inferTemplateKey(files: IncomingFile[]): string {
  const specifiers = new Set(
    files.flatMap(f => f.imports.map(i => i.specifier)),
  )

  for (const [specifier, key] of Object.entries(FRAMEWORK_MAP)) {
    if (specifiers.has(specifier)) return key
  }

  return "default"
}

export interface BootstrapParams {
  dir: string
  projectName: string
  packageName?: string
  key?: string
}

export async function bootstrap({
  dir,
  projectName,
  packageName,
  key,
}: BootstrapParams): Promise<FileOp[]> {
  const requestedKey = key ?? "default"
  const requestedPath = join(TEMPLATES_DIR, `${requestedKey}.txt`)
  const templatePath = existsSync(requestedPath)
    ? requestedPath
    : join(TEMPLATES_DIR, "default.txt")

  const raw = await readFile(templatePath, "utf-8")
  const entries = parseTemplate(raw)
  const ops: FileOp[] = []

  for (const entry of entries) {
    const content = entry.content
      .replaceAll(PROJECT_TOKEN, projectName)
      .replaceAll(PACKAGE_TOKEN, packageName ?? "")

    ops.push({ kind: "write", path: join(dir, entry.path), content })
  }

  return ops
}

const SEP_LINE_RE = /^={10,}\s*$/

export function parseTemplate(raw: string): { path: string, content: string }[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const entries: { path: string, content: string }[] = []

  let index = 0
  while (index < lines.length && !SEP_LINE_RE.test(lines[index])) {
    index += 1
  }

  while (index < lines.length) {
    if (!SEP_LINE_RE.test(lines[index])) {
      index += 1
      continue
    }

    index += 1
    while (index < lines.length && !lines[index].trim()) {
      index += 1
    }

    const path = lines[index]?.trim()
    if (!path) break
    index += 1

    while (index < lines.length && !lines[index].trim()) {
      index += 1
    }

    if (index >= lines.length || !SEP_LINE_RE.test(lines[index])) break
    index += 1

    const contentStart = index
    while (index < lines.length && !SEP_LINE_RE.test(lines[index])) {
      index += 1
    }

    const contentLines = lines.slice(contentStart, index)
    while (contentLines.length > 0 && !contentLines[0].trim()) {
      contentLines.shift()
    }
    while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
      contentLines.pop()
    }

    entries.push({
      path,
      content: contentLines.join("\n"),
    })
  }

  return entries
}
