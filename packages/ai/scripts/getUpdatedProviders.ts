import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { PROVIDERS } from "../src/ask.providers.ts"

type Level = "high" | "medium" | "low"
type ProviderId = keyof typeof PROVIDERS

const ASK_PROVIDERS_PATH = fileURLToPath(new URL("../src/ask.providers.ts", import.meta.url))

// some providers accept multiple env var names for the same key; check them all
const EXTRA_API_KEY_ENVS: Partial<Record<ProviderId, string[]>> = {
  glm: ["ZAI_API_KEY", "ZHIPU_API_KEY"],
  moonshot: ["KIMI_API_KEY"],
}

function apiKeyEnvs(id: ProviderId): string[] {
  return [PROVIDERS[id].apiKeyEnv, ...(EXTRA_API_KEY_ENVS[id] ?? [])]
}

function apiKey(id: ProviderId): string | null {
  for (const name of apiKeyEnvs(id)) {
    const value = process.env[name]
    if (value) return value
  }
  return null
}

async function fetchModelIds(id: ProviderId): Promise<string[]> {
  const key = apiKey(id)
  if (!key) throw new Error(`no api key (set one of ${apiKeyEnvs(id).join(", ")})`)

  const res = await fetch(`${PROVIDERS[id].baseURL}/models`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`GET /models -> ${res.status} ${res.statusText}`)

  const body = (await res.json()) as { data?: unknown }
  const rows = Array.isArray(body.data) ? body.data : []
  return rows
    .map(row => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
}

// splits a model id into a version-less "family" key plus its numeric version,
// so e.g. "glm-4.5-flash" and "glm-4.6-flash" are recognized as the same line
function versionKey(modelId: string): { family: string; version: number[] } | null {
  const match = modelId.match(/^(.*?)(\d+(?:\.\d+)*)(.*)$/)
  if (!match) return null
  const [, prefix, version, suffix] = match
  return { family: `${prefix}\0${suffix}`, version: version.split(".").map(Number) }
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const LEVEL_PRIORITY: Level[] = ["high", "medium", "low"]

// resolves updates for all levels of one provider together, so levels that share a
// model family (e.g. high="glm-5.2", medium="glm-5") get distinct versions rather
// than collapsing onto the same latest release
function resolveUpdates(current: Record<Level, string>, available: string[]): Partial<Record<Level, string>> {
  const currentKeys: Partial<Record<Level, { family: string; version: number[] }>> = {}
  for (const level of LEVEL_PRIORITY) {
    const key = versionKey(current[level])
    if (key) currentKeys[level] = key
  }

  const families = new Set(Object.values(currentKeys).map(k => k.family))
  const updates: Partial<Record<Level, string>> = {}

  for (const family of families) {
    const levels = LEVEL_PRIORITY.filter(l => currentKeys[l]?.family === family).sort(
      (a, b) => compareVersions(currentKeys[b]!.version, currentKeys[a]!.version),
    )

    const seenVersions = new Set<string>()
    const candidates: { id: string; version: number[] }[] = []
    for (const id of available) {
      const key = versionKey(id)
      if (!key || key.family !== family) continue
      const versionStr = key.version.join(".")
      if (seenVersions.has(versionStr)) continue
      seenVersions.add(versionStr)
      candidates.push({ id, version: key.version })
    }
    candidates.sort((a, b) => compareVersions(b.version, a.version))

    levels.forEach((level, i) => {
      const candidate = candidates[i]
      if (candidate && candidate.id !== current[level]) {
        updates[level] = candidate.id
      }
    })
  }

  return updates
}

function updateProvidersFile(updates: Partial<Record<ProviderId, Partial<Record<Level, string>>>>) {
  let text = readFileSync(ASK_PROVIDERS_PATH, "utf8")

  for (const [providerId, levels] of Object.entries(updates)) {
    const blockRe = new RegExp(`(${providerId}:\\s*{[\\s\\S]*?models:\\s*{)([\\s\\S]*?)(\\n\\s*},)`)
    const blockMatch = text.match(blockRe)
    if (!blockMatch) continue

    let block = blockMatch[2]
    for (const [level, modelId] of Object.entries(levels)) {
      block = block.replace(new RegExp(`(${level}:\\s*")[^"]+(")`), `$1${modelId}$2`)
    }
    text = text.replace(blockRe, `$1${block}$3`)
  }

  writeFileSync(ASK_PROVIDERS_PATH, text)
}

type Result = {
  provider: string
  updates: Partial<Record<Level, { from: string; to: string }>>
  error?: string
}

const args = Bun.argv.slice(2)
const onlyIndex = args.indexOf("--provider")
const only = onlyIndex === -1 ? null : args[onlyIndex + 1]

const allIds = Object.keys(PROVIDERS) as ProviderId[]
const targets = only ? allIds.filter(id => id === only) : allIds
if (targets.length === 0) {
  console.error(`unknown provider: ${only}`)
  process.exit(2)
}

const results: Result[] = []
const fileUpdates: Partial<Record<ProviderId, Partial<Record<Level, string>>>> = {}

for (const id of targets) {
  try {
    const available = await fetchModelIds(id)
    const current = PROVIDERS[id].models
    const resolved = resolveUpdates(current, available)
    const updates: Result["updates"] = {}

    for (const [level, modelId] of Object.entries(resolved) as [Level, string][]) {
      updates[level] = { from: current[level], to: modelId }
      ;(fileUpdates[id] ??= {})[level] = modelId
    }

    results.push({ provider: id, updates })
  } catch (err) {
    results.push({ provider: id, updates: {}, error: err instanceof Error ? err.message : String(err) })
  }
}

if (Object.keys(fileUpdates).length > 0) {
  updateProvidersFile(fileUpdates)
}

console.log(JSON.stringify(results, null, 2))

if (results.some(r => r.error)) process.exit(1)
