// @paladin/scaffold-v2/constants.ts

export const TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"])
export const SOURCE_EXCLUDED = [/\.config\.\w+$/, /\.d\.ts$/]

export const TS_IMPORT_RE = /(?:(?:import|export)\s+.*?|^})\s*from\s+["']([^"'.][^"']*)["']/gm
export const TS_TEST_RE = /\.test\.|\.spec\.|__tests__|e2e/

export const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers",
  "tls", "trace_events", "tty", "url", "util", "v8", "vm",
  "wasi", "worker_threads", "zlib",
])
