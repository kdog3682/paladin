// @paladin/scaffold-v2/bootstrap.ts

import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join, dirname, basename } from "path"
import { homedir } from "os"
import { getPaths } from "@paladin/utils/get-paths"

const SEP = "=".repeat(64)
const TOKEN = "{{ORG}}"
const PACKAGE_TOKEN = "{{PACKAGE_NAME}}"
const XDG = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
const TEMPLATE_DIR = join(XDG, "paladin", "templates")

// --- bootstrap ---

export interface BootstrapParams {
  dir: string
  org: string
  pkg?: string
  key?: string
}

export async function bootstrap({ dir, org, pkg, key }: BootstrapParams) {
  const template = key ? join(TEMPLATE_DIR, `${key}.txt`) : null

  if (template && existsSync(template)) {
    const paths = await hydrate(dir, template, org, pkg)
    return paths
  }

  if (key) console.log(`template "${key}" not found, creating minimal manifest`)

  await mkdir(dir, { recursive: true })

  const manifest = pkg
    ? { name: `@${org}/${pkg}`, version: "0.1.0", scripts: {} }
    : { name: org, private: true, workspaces: ["packages/*", "apps/*"], scripts: {} }

  const manifestPath = join(dir, "package.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  return [manifestPath]
}

async function hydrate(root: string, template: string, org: string, pkg?: string): Promise<string[]> {
  const raw = await readFile(template, "utf-8")
  const parts = raw.split(SEP).map(s => s.trim()).filter(Boolean)
  const written: string[] = []

  for (let i = 0; i < parts.length - 1; i += 2) {
    const rel = parts[i]
    const text = parts[i + 1]
      .replaceAll(TOKEN, org)
      .replaceAll(PACKAGE_TOKEN, pkg ?? "")
    const dest = join(root, rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, text)
    written.push(dest)
  }

  return written
}

// --- create template ---

export interface CreateTemplateParams {
  dir: string
  key: string
  exclude?: (RegExp | string)[]
  dryrun?: boolean
}

export async function createTemplate({ dir, key, exclude, dryrun }: CreateTemplateParams) {
  if (!existsSync(dir)) {
    console.log(`skipping "${key}": ${dir} does not exist`)
    return null
  }

  // infer org from the directory name or package.json
  let org: string | null = null
  const pkgJsonPath = join(dir, "package.json")
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
    const name: string = pkgJson.name ?? ""
    const m = name.match(/^@([^/]+)\//)
    if (m) org = m[1]
  }
  if (!org) org = basename(dir)

  const paths = getPaths(dir, { exclude, mode: "file" })

  if (!paths.length) {
    console.log(`skipping "${key}": no files found in ${dir}`)
    return null
  }

  const captured: { rel: string, text: string }[] = []
  for (const abs of paths) {
    const rel = abs.slice(dir.length + 1)
    const text = await readFile(abs, "utf-8")
    captured.push({ rel, text })
  }

  const parts = captured.map(({ rel, text }) => {
    const content = org ? text.replaceAll(org, TOKEN) : text
    return `${SEP}\n${rel}\n${SEP}\n${content}`
  })

  const output = parts.join("\n")

  if (dryrun) {
    console.log(`\n[dryrun] template "${key}" from ${dir}:`)
    console.log(output)
    return null
  }

  const dest = join(TEMPLATE_DIR, `${key}.txt`)
  await mkdir(TEMPLATE_DIR, { recursive: true })
  await writeFile(dest, output)
  console.log(`created template "${key}" (${captured.length} files) → ${dest}`)
  return { dest, paths: captured.map(c => c.rel) }
}
