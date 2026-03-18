// @paladin/scaffold/src/scaffold.ts

import { existsSync } from "fs"
import { join, basename, extname } from "path"
import {
  expandHome, extractHeader, stripHeader, deriveOrg,
  detectLang, filterUnchanged, writeFiles,
  type ResolvedFile,
} from "./shared"
import { scaffoldTypescript } from "./scaffold-typescript"
import { scaffoldPython } from "./scaffold-python"
import type { Artifact } from "./parse"

export interface ScaffoldOptions {
  baseProjectDir?: string
  workspaceFolders?: string[]
  defaultWorkspaceFolder?: string
  bootstrapRefs?: Record<string, string>
}

const DEFAULTS = {
  baseProjectDir: "~/projects",
  workspaceFolders: ["packages", "apps"],
  defaultWorkspaceFolder: "packages",
  bootstrapRefs: { web: "web", server: "server", ui: "ui", default: "default" } as Record<string, string>,
}

// --- path resolution per language ---

/**
 * resolve a typescript source file within the monorepo.
 *
 * handles two forms:
 *   explicit ws:  packages/api/handler.ts → root/packages/api/src/handler.ts
 *   shorthand:    api/handler.ts          → root/<defaultWs>/api/src/handler.ts
 *
 * src/ is injected when not already present in the file path.
 * returns the resolved path and the package name.
 */
function resolveTsPath(
  rel: string,
  root: string,
  wsFolders: string[],
  defaultWs: string,
): { path: string, pkg: string, pkgDir: string } {
  const parts = rel.split("/")
  const isExplicitWs = wsFolders.includes(parts[0])

  const pkgName = isExplicitWs ? parts[1] : parts[0]
  const pkgDir = isExplicitWs
    ? join(root, parts[0], parts[1])
    : join(root, defaultWs, pkgName)
  const filePath = isExplicitWs
    ? parts.slice(2).join("/")
    : parts.slice(1).join("/")

  const resolved = filePath.startsWith("src/") || filePath.includes("/src/")
    ? filePath
    : `src/${filePath}`

  return { path: join(pkgDir, resolved), pkg: pkgName, pkgDir }
}

/**
 * resolve a python source file within the project.
 *
 *   pkg/module.py → pyRoot/src/org/pkg/module.py
 *
 * this layout gives `from org.pkg.module import ...`
 * when src/ is on sys.path (standard uv/setuptools src layout).
 */
function resolvePyPath(rel: string, pyRoot: string, org: string): string {
  return join(pyRoot, "src", org, rel)
}

// --- orchestrator ---

export async function scaffold(artifacts: Artifact[], options: ScaffoldOptions = {}) {
  const base = expandHome(options.baseProjectDir ?? DEFAULTS.baseProjectDir)
  const wsFolders = options.workspaceFolders ?? DEFAULTS.workspaceFolders
  const defaultWs = options.defaultWorkspaceFolder ?? DEFAULTS.defaultWorkspaceFolder
  const org = deriveOrg(artifacts)
  const prefix = `@${org}/`

  // org root — always ~/projects/<org>
  const root = join(base, org)

  // python project root — nests under root/python/ if ts already owns the root,
  // so pyproject.toml doesn't collide with package.json at the same level
  const pyRoot = existsSync(join(root, "package.json"))
    ? join(root, "python")
    : root

  const tsFiles: ResolvedFile[] = []
  const pyFiles: ResolvedFile[] = []
  const plain: ResolvedFile[] = []

  for (const a of artifacts) {
    const header = extractHeader(a.content)
    if (!header) continue

    const lines = a.content.trim().split('\n')
    if (lines[0].includes('deprecated')) continue
    if (lines[1] && lines[1].includes('deprecated')) continue

    const name = basename(header)
    const isJson = extname(name) === ".json"
    const content = isJson ? stripHeader(a.content) : a.content

    // absolute or home-relative — always plain, write exactly where specified
    if (header.startsWith("/") || header.startsWith("~/")) {
      plain.push({ path: expandHome(header), content, lang: null, pkg: null, pkgDir: null })
      continue
    }

    // ./ relative — always to org root
    if (header.startsWith("./")) {
      plain.push({ path: join(root, header.slice(2)), content, lang: null, pkg: null, pkgDir: null })
      continue
    }

    // bare filename (no slashes) — org root
    if (!header.includes("/")) {
      plain.push({ path: join(root, header), content, lang: null, pkg: null, pkgDir: null })
      continue
    }

    // validate org — every @-scoped path must match the derived org
    if (header.startsWith("@")) {
      const m = header.match(/^@([^/]+)\//)
      if (m && m[1] !== org) {
        throw new Error(`multiple orgs: expected @${org} but found @${m[1]} in "${header}"`)
      }
    }

    // rel = path relative to org, after stripping @org/ prefix
    // e.g. @acme/api/handler.ts → api/handler.ts
    const rel = header.startsWith(prefix) ? header.slice(prefix.length) : header
    const lang = detectLang(name)

    if (lang === "python") {
      pyFiles.push({
        path: resolvePyPath(rel, pyRoot, org),
        content, lang, pkg: null,
      })
    } else if (lang === "typescript") {
      const resolved = resolveTsPath(rel, root, wsFolders, defaultWs)
      tsFiles.push({
        path: resolved.path,
        content, lang, pkg: resolved.pkg, pkgDir: resolved.pkgDir,
      })
    } else {
      // non-source scoped file — relative to org root
      // e.g. @acme/api/tsconfig.json → root/api/tsconfig.json
      plain.push({
        path: join(root, rel),
        content, lang: null, pkg: null, pkgDir: null,
      })
    }
  }

  // --- filter unchanged across all files before doing any work ---

  const all = [...tsFiles, ...pyFiles, ...plain]
  const changed = new Set((await filterUnchanged(all)).map(f => f.path))
  const tsChanged = tsFiles.filter(f => changed.has(f.path))
  const pyChanged = pyFiles.filter(f => changed.has(f.path))
  const plainChanged = plain.filter(f => changed.has(f.path))

  // --- dispatch to language-specific scaffolders ---

  const written: string[] = []

  if (tsChanged.length) {
    const result = await scaffoldTypescript({
      org, root, files: tsChanged,
      bootstrapRefs: { ...DEFAULTS.bootstrapRefs, ...options.bootstrapRefs },
    })
    written.push(...result)
  }

  if (pyChanged.length) {
    const result = await scaffoldPython({ org, root: pyRoot, files: pyChanged })
    written.push(...result)
  }

  if (plainChanged.length) {
    await writeFiles(plainChanged)
    written.push(...plainChanged.map(f => f.path))
  }

  return { projectRoot: root, files: written }
}
