// @paladin/scaffold-v2/scaffold/matchers/route-registration.ts

import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { join, basename } from "path"
import { writeFileSafe } from "@paladin/utils/fs"
import type { Matcher } from "./types"

interface RouteInfo {
  featureName: string
  importName: string
  importPath: string
  apiPath: string
}

/**
 * detect *.routes.ts files under src/features/<name>/
 * and patch src/index.ts to register them as hono routes.
 *
 * e.g. src/features/users/users.routes.ts →
 *   import usersRoutes from './features/users/users.routes'
 *   app.route('/api/users', usersRoutes)
 *
 * batches all route files per package into a single index.ts edit.
 */
export const routeRegistrationMatcher: Matcher = async (pkg) => {
  const routePattern = /src\/features\/([^/]+)\/[^/]+\.routes\.ts$/
  const routes: RouteInfo[] = []

  for (const f of pkg.files) {
    const match = f.absolutePath.match(routePattern)
    if (!match) continue

    const featureName = match[1]
    const fileName = basename(f.absolutePath, ".ts")
    const importName = toCamelCase(fileName)
    const relPath = f.relativePath.replace(/^src\//, "./").replace(/\.ts$/, "")

    routes.push({
      featureName,
      importName,
      importPath: relPath,
      apiPath: `/api/${featureName}`,
    })
  }

  if (!routes.length) return { matched: false }

  const indexPath = join(pkg.packageDir, "src/index.ts")
  const created: string[] = []

  if (!existsSync(indexPath)) {
    const content = buildFreshIndex(routes)
    writeFileSafe(indexPath, content)
    created.push(indexPath)
    return { matched: true, filesCreated: created }
  }

  const existing = await readFile(indexPath, "utf-8")
  const patched = patchIndex(existing, routes)

  if (patched !== existing) {
    writeFileSafe(indexPath, patched)
  }

  return { matched: true, filesCreated: created }
}

function buildFreshIndex(routes: RouteInfo[]): string {
  const lines = [
    `import { Hono } from "hono"`,
    ``,
    ...routes.map(r => `import ${r.importName} from "${r.importPath}"`),
    ``,
    `const app = new Hono()`,
    ``,
    ...routes.map(r => `app.route("${r.apiPath}", ${r.importName})`),
    ``,
    `export default app`,
    ``,
  ]
  return lines.join("\n")
}

function patchIndex(content: string, routes: RouteInfo[]): string {
  let result = content

  for (const route of routes) {
    const importLine = `import ${route.importName} from "${route.importPath}"`
    const routeLine = `app.route("${route.apiPath}", ${route.importName})`

    if (result.includes(route.importPath)) continue

    // insert import after the last existing import
    const importInsertIdx = findLastImportEnd(result)
    if (importInsertIdx !== -1) {
      result = result.slice(0, importInsertIdx) + importLine + "\n" + result.slice(importInsertIdx)
    }

    // insert route call before `export default`
    const exportIdx = result.indexOf("export default")
    if (exportIdx !== -1) {
      result = result.slice(0, exportIdx) + routeLine + "\n" + result.slice(exportIdx)
    }
  }

  return result
}

function findLastImportEnd(content: string): number {
  const lines = content.split("\n")
  let lastImportLine = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("import ")) lastImportLine = i
  }

  if (lastImportLine === -1) return -1

  let idx = 0
  for (let i = 0; i <= lastImportLine; i++) {
    idx += lines[i].length + 1
  }
  return idx
}

function toCamelCase(str: string): string {
  return str.replace(/[-.](\w)/g, (_, c) => c.toUpperCase())
}
