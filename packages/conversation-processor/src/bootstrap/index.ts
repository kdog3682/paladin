// @paladin/conversation-processor/bootstrap/index.ts

import { readFile } from "fs/promises"
import { join } from "path"
import type { IncomingFile, FileOp } from "../types"

const SEP_RE = /^={10,}$/m
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
  const templatePath = join("./templates", `${key ?? "default"}.txt`)
  const raw = await readFile(templatePath, "utf-8")
  const parts = raw.split(SEP_RE).map(s => s.trim())
  const ops: FileOp[] = []

  for (let i = 1; i < parts.length; i += 2) {
    const rel = parts[i - 1]
    const content = parts[i]
      .replaceAll(PROJECT_TOKEN, projectName)
      .replaceAll(PACKAGE_TOKEN, packageName ?? "")

    ops.push({ kind: "write", path: join(dir, rel), content })
  }

  return ops
}
