// @paladin/scaffold-v3/scaffold/bootstrap.ts

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"

const SEP_RE = /^={10,}$/m
const PROJECT_TOKEN = "{{PROJECT_NAME}}"
const PACKAGE_TOKEN = "{{PACKAGE_NAME}}"

const TEMPLATE_DIR = join(import.meta.dir, "..", "..", "templates")

export interface BootstrapParams {
  dir: string
  projectName: string
  packageName?: string
  key?: string
}

/**
 * hydrate a directory from a template file.
 * falls back to "default" when key is not provided.
 * throws if the template file does not exist.
 */
export async function hydrate({ dir, projectName, packageName, key }: BootstrapParams): Promise<string[]> {
  const templatePath = join(TEMPLATE_DIR, `${key ?? "default"}.txt`)
  const raw = await readFile(templatePath, "utf-8")
  const parts = raw.split(SEP_RE).map(s => s.trim())
  const written: string[] = []

  for (let i = 1; i < parts.length; i += 2) {
    const rel = parts[i - 1]
    const text = parts[i]
      .replaceAll(PROJECT_TOKEN, projectName)
      .replaceAll(PACKAGE_TOKEN, packageName ?? "")

    const dest = join(dir, rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, text)
    written.push(dest)
  }

  return written
}
