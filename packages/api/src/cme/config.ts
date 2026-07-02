import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { systemConfigDir, configPath } from './paths'

export interface PaladinConfig {
  zenMode: 'none' | 'partial' | 'full'
}

const DEFAULT_CONFIG: PaladinConfig = { zenMode: 'none' }

let cache: PaladinConfig | null = null

export async function getConfig(): Promise<PaladinConfig> {
  if (cache) return cache
  if (!existsSync(configPath())) {
    cache = DEFAULT_CONFIG
    return cache
  }
  const raw = await readFile(configPath(), 'utf-8')
  cache = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  return cache
}

export async function setConfig(patch: Partial<PaladinConfig>): Promise<PaladinConfig> {
  const current = await getConfig()
  cache = { ...current, ...patch }
  await mkdir(systemConfigDir(), { recursive: true })
  await writeFile(configPath(), JSON.stringify(cache, null, 2), 'utf-8')
  return cache
}
