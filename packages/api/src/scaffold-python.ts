// @paladin/api/src/scaffold-python.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join, basename, dirname } from "path"
import { bash } from "./bash"
import { bootstrap } from "./bootstrap"
import { writeFileSafe } from "./utils"
import { writeFiles, type ScaffoldInput } from "./shared"
import { PY_IMPORT_RE, PY_TEST_RE, PY_STDLIB } from "./constants"

function collectExternalImports(content: string, org: string): string[] {
  const ext = new Set<string>()
  let m
  PY_IMPORT_RE.lastIndex = 0
  while ((m = PY_IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] || m[2]
    if (!spec) continue
    const top = spec.split(".")[0]
    if (top === "__future__" || top === org || PY_STDLIB.has(top)) continue
    ext.add(top)
  }
  return [...ext]
}

/**
 * parse existing deps from pyproject.toml's `dependencies = [...]` block.
 * handles multiline arrays like:
 *   dependencies = [
 *       "requests>=2.28",
 *       "pydantic",
 *   ]
 * extracts just the package name (before any version specifier).
 */
async function readExistingDeps(root: string): Promise<Set<string>> {
  const toml = join(root, "pyproject.toml")
  if (!existsSync(toml)) return new Set()
  const raw = await readFile(toml, "utf-8")
  const deps = new Set<string>()

  // match the dependencies array, allowing multiline content between [ and ]
  const block = raw.match(/dependencies\s*=\s*\[([\s\S]*?)\]/)
  if (block) {
    // each dep is a quoted string — extract name before any version operator
    // e.g. "requests>=2.28" → "requests", "pydantic" → "pydantic"
    for (const item of block[1].matchAll(/["']([a-zA-Z0-9_-]+)/g)) {
      deps.add(item[1])
    }
  }

  // also check optional-dependencies and dev groups
  // e.g. [project.optional-dependencies] or [tool.uv.dev-dependencies]
  const devBlock = raw.match(/dev-dependencies\s*=\s*\[([\s\S]*?)\]/)
  if (devBlock) {
    for (const item of devBlock[1].matchAll(/["']([a-zA-Z0-9_-]+)/g)) {
      deps.add(item[1])
    }
  }

  return deps
}

/**
 * create __init__.py in every directory between src/ and each source file.
 * this is what makes `from org.pkg.module import ...` work —
 * each directory in the chain needs to be a python package.
 */
function collectInitPaths(root: string, files: { path: string }[]): string[] {
  const src = join(root, "src")
  const needed = new Set<string>()
  for (const f of files) {
    if (!f.path.startsWith(src)) continue
    let dir = dirname(f.path)
    while (dir !== src && dir.length > src.length) {
      needed.add(dir)
      dir = dirname(dir)
    }
  }
  return [...needed]
    .map(d => join(d, "__init__.py"))
    .filter(p => !existsSync(p))
}

/**
 * bootstrap, write, and install deps for python files.
 *
 * expects input.root to be the python project root — this is where
 * pyproject.toml lives and where `uv add` runs. the orchestrator
 * decides this root (it may be nested under an existing ts project
 * at ~/projects/org/python/ rather than ~/projects/org/).
 *
 * file paths should already be fully resolved by the orchestrator,
 * following the layout: root/src/org/pkg/module.py
 */
export async function scaffoldPython(input: ScaffoldInput): Promise<string[]> {
  const { org, root } = input
  const files = input.files

  if (!existsSync(join(root, "pyproject.toml"))) {
    await bootstrap({ dir: root, org, key: "python-root" })
  }

  await writeFiles(files)

  for (const p of collectInitPaths(root, input.files)) {
    await writeFileSafe(p, "")
  }

  const existing = await readExistingDeps(root)
  const deps = new Set<string>()
  const devDeps = new Set<string>()

  for (const f of files) {
    const target = PY_TEST_RE.test(basename(f.path)) ? devDeps : deps
    for (const d of collectExternalImports(f.content, org)) {
      if (!existing.has(d)) target.add(d)
    }
  }

  for (const d of deps) devDeps.delete(d)
  if (deps.size) await bash(["uv", "add", ...deps], { cwd: root })
  if (devDeps.size) await bash(["uv", "add", "--dev", ...devDeps], { cwd: root })

  return files.map(f => f.path)
}
