// @paladin/scaffold-v2/bootstrap.ts

import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"

const SEP = "=".repeat(64)
const TOKEN = "{{ORG}}"
const PACKAGE_TOKEN = "{{PACKAGE_NAME}}"
const XDG = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
const TEMPLATE_DIR = join(XDG, "paladin", "templates")

export interface BootstrapParams {
  dir: string
  projectName: string
  packageName?: string
  key?: string
}

/**
 * bootstrap a directory from a template or a minimal package.json.
 * returns the list of files created.
 */
export async function bootstrap({ dir, projectName, packageName, key }: BootstrapParams): Promise<string[]> {
  const template = key ? join(TEMPLATE_DIR, `${key}.txt`) : null

  if (template && existsSync(template)) {
    return hydrate(dir, template, projectName, packageName)
  }

  await mkdir(dir, { recursive: true })

  const manifest = packageName
    ? { name: `@${projectName}/${packageName}`, version: "0.1.0", scripts: {} }
    : { name: projectName, private: true, workspaces: ["packages/*", "apps/*"], scripts: {} }

  const manifestPath = join(dir, "package.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  return [manifestPath]
}

async function hydrate(root: string, template: string, projectName: string, packageName?: string): Promise<string[]> {
  const raw = await readFile(template, "utf-8")
  const parts = raw.split(SEP).map(s => s.trim()).filter(Boolean)
  const written: string[] = []

  for (let i = 0; i < parts.length - 1; i += 2) {
    const rel = parts[i]
    const text = parts[i + 1]
      .replaceAll(TOKEN, projectName)
      .replaceAll(PACKAGE_TOKEN, packageName ?? "")
    const dest = join(root, rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, text)
    written.push(dest)
  }

  return written
}
