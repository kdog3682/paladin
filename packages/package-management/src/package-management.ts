// @paladin/package-management/package-management.ts

import { rm } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"
import { GitRepo } from "./lib/git"
import { buildTagName, resolveVersion, nextVersion, listTagsForPackage } from "./lib/tags"
import { readSnapshot, readSnapshotMeta, type Snapshot, type SnapshotMeta } from "./lib/snapshot"
import { readGroup, buildTagMessage } from "./lib/groups"
import { findDependents, hasDependents, formatDependentWarnings } from "./lib/dependents"
import { inferProfile, type ProfileKey } from "./lib/profiles"
import { scaffold, bumpMinorVersion } from "./lib/scaffold"

export interface PackageManagerConfig {
  root: string
  projectName: string
  packagesDir?: string
}

export class PackageManager {
  private git: GitRepo
  private root: string
  private projectName: string
  private packagesDir: string

  constructor(config: PackageManagerConfig) {
    this.root = config.root
    this.projectName = config.projectName
    this.packagesDir = config.packagesDir ?? "packages"
    this.git = new GitRepo(this.root)
  }

  private pkgDir(name: string): string {
    const short = name.replace(/^@[^/]+\//, "")
    return join(this.packagesDir, short)
  }

  private fullPkgPath(name: string): string {
    return join(this.root, this.pkgDir(name))
  }

  private async assertClean(): Promise<void> {
    const clean = await this.git.isClean()
    if (!clean) {
      throw new Error("Working tree is not clean. Commit or stash changes first.")
    }
  }

  // ── Init ─────────────────────────────────────────────────────────

  async initRepo(): Promise<string[]> {
    const rootPkg = join(this.root, "package.json")
    if (existsSync(rootPkg)) {
      throw new Error("Repo already initialized — package.json exists.")
    }

    return scaffold({
      dir: this.root,
      projectName: this.projectName,
      packageName: "",
      profileKey: "root",
    })
  }

  // ── Create ──────────────────────────────────────────────────────

  async createPackage(name: string): Promise<string[]> {
    await this.assertClean()

    const existing = await listTagsForPackage(this.git, name)
    if (existing.length > 0) {
      throw new Error(
        `Deprecation tags exist for ${name}. Use restore or deprecate with recreate instead.`
      )
    }

    const dir = this.fullPkgPath(name)
    const short = name.replace(/^@[^/]+\//, "")

    const written = await scaffold({
      dir,
      projectName: this.projectName,
      packageName: short,
      profileKey: "typescript",
    })

    await this.git.addAll()
    await this.git.commit(`create: ${name}`)

    return written
  }

  // ── Deprecate ───────────────────────────────────────────────────

  async deprecatePackages(
    names: string[],
    options: { force?: boolean, recreate?: boolean } = {}
  ): Promise<void> {
    await this.assertClean()

    if (!options.force) {
      const depMap = await findDependents(this.root, names)
      if (hasDependents(depMap)) {
        throw new Error(
          `Cannot deprecate — packages have dependents:\n${formatDependentWarnings(depMap)}\nUse force to override.`
        )
      }
    }

    const group = [...names]
    for (const name of names) {
      const ver = await nextVersion(this.git, name)
      const tag = buildTagName(name, ver)
      const message = buildTagMessage(group)
      await this.git.createTag(tag, message)
    }

    for (const name of names) {
      const dir = this.pkgDir(name)
      await this.git.rm([dir], true)
    }

    await this.git.addAll()
    await this.git.commit(`deprecate: ${names.join(", ")}`)

    if (options.recreate) {
      await this.recreateFromLatest(names)
    }
  }

  private async recreateFromLatest(names: string[]): Promise<void> {
    for (const name of names) {
      const parsed = await resolveVersion(this.git, name, "latest")
      if (!parsed) {
        throw new Error(`No deprecation tags found for ${name} after deprecation.`)
      }

      const dir = this.pkgDir(name)
      const snapshot = await readSnapshot(this.git, parsed, dir)
      const profileKey = inferProfile(snapshot.files)
      const short = name.replace(/^@[^/]+\//, "")

      await scaffold({
        dir: this.fullPkgPath(name),
        projectName: this.projectName,
        packageName: short,
        profileKey,
      })
    }

    await this.git.addAll()
    await this.git.commit(`recreate: ${names.join(", ")}`)
  }

  // ── Retrieve / Inspect ──────────────────────────────────────────

  async retrievePackage(
    name: string,
    version: "latest" | "oldest" | `v${number}` | number
  ): Promise<Snapshot> {
    const parsed = await resolveVersion(this.git, name, version)
    if (!parsed) {
      throw new Error(`No tag found for ${name}@${version}`)
    }
    const dir = this.pkgDir(name)
    return readSnapshot(this.git, parsed, dir)
  }

  async inspectPackage(
    name: string,
    version: "latest" | "oldest" | `v${number}` | number
  ): Promise<SnapshotMeta> {
    const parsed = await resolveVersion(this.git, name, version)
    if (!parsed) {
      throw new Error(`No tag found for ${name}@${version}`)
    }
    const dir = this.pkgDir(name)
    return readSnapshotMeta(this.git, parsed, dir)
  }

  // ── List ────────────────────────────────────────────────────────

  async listDeprecated(): Promise<Array<{
    packageName: string
    versions: number[]
    latestGroup: string[]
  }>> {
    const allTags = await this.git.listTags("deprecated/*")
    const byPackage = new Map<string, number[]>()

    for (const raw of allTags) {
      const match = raw.match(/^deprecated\/(.+)\/v(\d+)$/)
      if (!match) continue
      const [, pkg, ver] = match
      if (!byPackage.has(pkg)) byPackage.set(pkg, [])
      byPackage.get(pkg)!.push(parseInt(ver, 10))
    }

    const results = []
    for (const [packageName, versions] of byPackage) {
      versions.sort((a, b) => a - b)
      const latestTag = buildTagName(packageName, versions[versions.length - 1])
      const group = await readGroup(this.git, latestTag)
      results.push({ packageName, versions, latestGroup: group.members })
    }

    return results
  }

  // ── Restore ─────────────────────────────────────────────────────

  async restorePackages(
    names: string[],
    version: "latest" | "oldest" | `v${number}` | number,
    options: { linked?: boolean } = {}
  ): Promise<void> {
    await this.assertClean()

    const parsed = await resolveVersion(this.git, names[0], version)
    if (!parsed) {
      throw new Error(`No tag found for ${names[0]}@${version}`)
    }

    const group = await readGroup(this.git, parsed.raw)

    if (group.members.length > 1 && options.linked === undefined) {
      throw new Error(
        `${names[0]} was deprecated as part of a group: ${group.members.join(", ")}.\n` +
        `Pass linked: true to restore all, or linked: false to restore only the requested packages.`
      )
    }

    const toRestore = options.linked
      ? group.members
      : names

    for (const name of toRestore) {
      const pkg = await resolveVersion(this.git, name, version)
      if (!pkg) {
        throw new Error(`No tag found for ${name}@${version}`)
      }

      const dir = this.pkgDir(name)
      const snapshot = await readSnapshot(this.git, pkg, dir)
      const profileKey = inferProfile(snapshot.files)
      const short = name.replace(/^@[^/]+\//, "")

      // deprecate current version first
      const nextVer = await nextVersion(this.git, name)
      const depTag = buildTagName(name, nextVer)
      const depMessage = buildTagMessage(
        toRestore,
        `restored from ${pkg.raw}`
      )
      await this.git.createTag(depTag, depMessage)

      // scaffold fresh from inferred profile
      const fullDir = this.fullPkgPath(name)
      await rm(fullDir, { recursive: true, force: true })
      await scaffold({
        dir: fullDir,
        projectName: this.projectName,
        packageName: short,
        profileKey,
      })

      // bump version in the scaffolded package.json
      await this.bumpPackageVersion(fullDir)
    }

    await this.git.addAll()
    await this.git.commit(
      `restore: ${toRestore.join(", ")} (from ${parsed.raw})`
    )
  }

  private async bumpPackageVersion(dir: string): Promise<void> {
    const pkgPath = join(dir, "package.json")
    const raw = await Bun.file(pkgPath).text()
    const pkg = JSON.parse(raw)
    if (pkg.version) {
      pkg.version = bumpMinorVersion(pkg.version)
      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
    }
  }
}
