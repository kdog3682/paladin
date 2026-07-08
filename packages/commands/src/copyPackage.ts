import {cpSync, existsSync, readFileSync, writeFileSync} from "node:fs"
import {execSync} from "node:child_process"
import {homedir} from "node:os"
import {join} from "node:path"
import {pathResolver} from "@paladin/utils/pathResolver"

function resolvePkg(at: string) {
  const [project, pkg] = at.replace(/^@/, "").split("/")
  return pathResolver(homedir(), "projects", project, "packages", pkg.toLowerCase())
}

function resolveProjectRoot(at: string) {
  const [project] = at.replace(/^@/, "").split("/")
  return pathResolver(homedir(), "projects", project)
}

export function copyFolders(from: string, to: string, folders: string[]) {
  const src = resolvePkg(from)
  const dest = resolvePkg(to)
  for (const folder of folders) {
    const srcFolder = join(src, folder)
    if (!existsSync(srcFolder)) throw new Error(`missing folder: ${srcFolder}`)
    cpSync(srcFolder, join(dest, folder), {recursive: true})
  }
}

const DEP_KEYS = ["dependencies", "devDependencies", "peerDependencies"] as const

export function mergePackageJsonDependencies(from: string, to: string) {
  const fromPkg = JSON.parse(readFileSync(join(resolvePkg(from), "package.json"), "utf8"))
  const toPath = join(resolvePkg(to), "package.json")
  const toPkg = JSON.parse(readFileSync(toPath, "utf8"))

  let touched = false
  for (const key of DEP_KEYS) {
    const fromDeps = fromPkg[key]
    if (!fromDeps) continue
    toPkg[key] ??= {}
    for (const [name, version] of Object.entries(fromDeps)) {
      if (name in toPkg[key]) continue
      toPkg[key][name] = version
      touched = true
    }
  }

  if (touched) {
    for (const key of DEP_KEYS) if (toPkg[key]) toPkg[key] = sortDeps(toPkg[key])
    writeFileSync(toPath, JSON.stringify(toPkg, null, 2) + "\n")
  }
  return touched
}

function sortDeps(deps: Record<string, string>) {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)))
}

export function copyPackage(from: string, to: string, folders: string[]) {
  copyFolders(from, to, folders)
  const touched = mergePackageJsonDependencies(from, to)
  if (touched) execSync("bun install", {cwd: resolveProjectRoot(to), stdio: "inherit"})
}
