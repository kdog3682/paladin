// @paladin/api/src/lang.ts

import { extname } from "path"

export type LangName = "typescript" | "python"

const TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"])
const PY_EXTS = new Set([".py", ".pyi"])
const EXCLUDED = [/\.config\.\w+$/, /\.d\.ts$/]

/** detect language from source file extension only.
 *  non-source files (json, toml, config, etc) return null
 *  and are handled as plain files by the orchestrator. */
export function detect(filename: string): LangName | null {
  if (EXCLUDED.some(p => p.test(filename))) return null
  const ext = extname(filename)
  if (TS_EXTS.has(ext)) return "typescript"
  if (PY_EXTS.has(ext)) return "python"
  return null
}
