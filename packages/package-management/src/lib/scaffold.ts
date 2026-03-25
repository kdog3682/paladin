// @paladin/package-management/lib/scaffold.ts

import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join, dirname } from "path"

const SEP_RE = /^={10,}$/m
const PROJECT_TOKEN = "{{PROJECT_NAME}}"
const PACKAGE_TOKEN = "{{PACKAGE_NAME}}"

const TEMPLATE_DIR = join(import.meta.dir, "..", "templates")

export interface ScaffoldParams {
  dir: string
  projectName: string
  packageName: string
  profileKey: string
}

export async function scaffold(params: ScaffoldParams): Promise<string[]> {
  const { dir, projectName, packageName, profileKey } = params
  const templatePath = join(TEMPLATE_DIR, `${profileKey}.txt`)

  if (existsSync(templatePath)) {
    return hydrate(dir, templatePath, projectName, packageName)
  }

  // fallback: minimal package.json
  await mkdir(dir, { recursive: true })
  const manifest = {
    name: `@${projectName}/${packageName}`,
    version: "0.1.0",
    scripts: {},
  }
  const manifestPath = join(dir, "package.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
  return [manifestPath]
}

export async function hydrate(
  root: string,
  templatePath: string,
  projectName: string,
  packageName?: string
): Promise<string[]> {
  const raw = await readFile(templatePath, "utf-8")
  const parts = raw.split(SEP_RE).map(s => s.trim()).filter(Boolean)

  // skip preamble — find the first part that looks like a file path
  const startIdx = parts.findIndex(p => /[./]/.test(p) && !p.includes(" "))
  if (startIdx === -1) return []

  const fileParts = parts.slice(startIdx)
  const written: string[] = []

  for (let i = 0; i < fileParts.length - 1; i += 2) {
    const rel = fileParts[i]
    const text = fileParts[i + 1]
      .replaceAll(PROJECT_TOKEN, projectName)
      .replaceAll(PACKAGE_TOKEN, packageName ?? "")

    const dest = join(root, rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, text)
    written.push(dest)
  }

  return written
}

export function bumpMinorVersion(version: string): string {
  const parts = version.split(".")
  if (parts.length < 2) return "0.2.0"
  const minor = parseInt(parts[1], 10)
  parts[1] = String(minor + 1)
  if (parts.length > 2) parts[2] = "0"
  return parts.join(".")
}
