import { join, extname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { collectImports } from '@paladin/utils'
import { expandHome } from '../../utils/path'
import type { FileEntry } from './types'

const PALADIN_DIR = expandHome('~/projects/paladin')
const NPM_DEPS_CACHE = join(PALADIN_DIR, 'npm-dependencies.json')
const IMPORT_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

/** A directory that owns its own package.json — the project root or a package. */
export interface ScaffoldTarget {
  name: string
  dir: string
  isNew: boolean
  files: FileEntry[]
}

export interface DepSets {
  deps: Record<string, string>
  devDeps: Record<string, string>
}

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(path) || /(?:^|\/)(test|__tests__)\//.test(path)
}

function isImportable(path: string): boolean {
  return IMPORT_EXTS.has(extname(path))
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
}

async function readManifest(dir: string): Promise<Manifest> {
  const path = join(dir, 'package.json')
  return existsSync(path) ? JSON.parse(stripJsonComments(await Bun.file(path).text())) : {}
}

export class DependencyResolver {
  private readonly cache: Record<string, string>
  private scope: string
  private dirty: boolean = false

  constructor(
    private readonly cachePath = NPM_DEPS_CACHE,
  ) {
    this.cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
  }

  /** Returns the deps added to `target`, or null when nothing was new. */
  async resolve(projectName, target: ScaffoldTarget): Promise<DepSets | null> {
        const scope = projectName.startsWith('@') ? projectName : `@${projectName}`
        this.scope = scope

    const manifest = await readManifest(target.dir)
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ])
    const self = `${scope}/${target.name}`

    const deps: Record<string, string> = {}
    const devDeps: Record<string, string> = {}

    for (const file of target.files) {
      if (!isImportable(file.path)) continue
      const bucket = isTestFile(file.path) ? devDeps : deps

      for (const ref of collectImports(file.content)) {
        if (ref.type === 'local') continue
        const root = ref.source
        if (declared.has(root) || root in deps || root in devDeps) continue

        if (root.startsWith('@paladin')) {
          bucket[root] = 'workspace:*'
        } else if (this.isWorkspace(root)) {
          if (root !== self) bucket[root] = 'workspace:*'
        } else {
          bucket[root] = await this.version(root)
        }
      }
    }

    if (!Object.keys(deps).length && !Object.keys(devDeps).length) return null

    manifest.dependencies = { ...(manifest.dependencies ?? {}), ...deps }
    manifest.devDependencies = { ...(manifest.devDependencies ?? {}), ...devDeps }
    if (!Object.keys(manifest.dependencies).length) delete manifest.dependencies
    if (!Object.keys(manifest.devDependencies).length) delete manifest.devDependencies

    await Bun.write(join(target.dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    return { deps, devDeps }
  }

  /** Persists the version cache to disk if it changed. */
  async flush(): Promise<bool> {
    if (this.dirty) {
      await Bun.write(this.cachePath, JSON.stringify(this.cache, null, 2) + '\n')
    }
    return this.dirty
  }

  /** A scoped import under the project's own scope is a sibling workspace package. */
  private isWorkspace(root: string): boolean {
    return root === this.scope || root.startsWith(`${this.scope}/`) || root == 'paladin'
  }

  private async version(name: string): Promise<string> {
    const cached = this.cache[name]
    if (cached) return cached

    const res = await fetch(`https://registry.npmjs.org/${name}/latest`)
    const data = (await res.json()) as { version?: string }
    if (!data.version) throw new Error(`scaffold: no version found for "${name}"`)

    const spec = `^${data.version}`
    this.cache[name] = spec
    this.dirty = true
    return spec
  }
}
