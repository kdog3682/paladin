// @paladin/conversation-processor/utils/parse-imports.ts

import type { ParsedImport } from "../types"

export const TS_IMPORT_RE = /(?:(?:import|export)\s+.*?|^})\s*from\s+["']([^"'.][^"']*)["']/gm

const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "dns", "domain", "events", "fs", "http", "http2",
  "https", "module", "net", "os", "path", "perf_hooks", "process",
  "punycode", "querystring", "readline", "repl", "stream", "string_decoder",
  "sys", "timers", "tls", "tty", "url", "util", "v8", "vm", "wasi",
  "worker_threads", "zlib",
])

function isIgnored(spec: string): boolean {
  if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("node:") || spec.startsWith("bun:")) return true
  const bare = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
  return NODE_BUILTINS.has(bare)
}

export function getImports(content: string, projectName: string): ParsedImport[] {
  const seen = new Set<string>()
  const entries: ParsedImport[] = []
  const prefix = `@${projectName}/`

  for (const [, spec] of content.matchAll(TS_IMPORT_RE)) {
    if (isIgnored(spec)) continue
    if (seen.has(spec)) continue
    seen.add(spec)

    entries.push({
      specifier: spec,
      kind: spec.startsWith(prefix) ? "workspace" : "external",
    })
  }

  return entries
}
