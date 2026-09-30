import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { cached } from "../cache/cached.ts"

/* the dotenv file keys are read from */
export const ENV_FILE = join(homedir(), ".env")

/* where resolved keys are cached, one json file per env name */
export const ENV_CACHE_DIR = join(homedir(), ".cache", "paladin", "env")

/*
 * resolve an api key by env name: disk cache first, then ~/.env (which fills the cache). throws when missing.
 * after rotating a key, call getApiKey.forget(name)
 */
export const getApiKey = cached(
  async (name: string): Promise<string> => {
    const value = parseEnvFile(ENV_FILE)[name]
    if (!value) throw new Error(`${name} not found in ${ENV_FILE}`)
    return value
  },
  { dir: ENV_CACHE_DIR }
)

/* parse a dotenv file: KEY=value, optional `export`, quotes, # comments */
export function parseEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const vars: Record<string, string> = {}
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    vars[match[1]] = unquote(match[2])
  }
  return vars
}

function unquote(value: string): string {
  const quote = value[0]
  if (quote === `"` || quote === `'`) {
    const end = value.indexOf(quote, 1)
    if (end !== -1) return value.slice(1, end)
  }
  // unquoted: drop a trailing inline comment
  return value.replace(/\s+#.*$/, "").trim()
}
