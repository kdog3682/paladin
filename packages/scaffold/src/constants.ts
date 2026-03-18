// @paladin/scaffold/src/constants.ts

export const TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"])
export const PY_EXTS = new Set([".py", ".pyi"])
export const SOURCE_EXCLUDED = [/\.config\.\w+$/, /\.d\.ts$/]

export const TS_IMPORT_RE = /(?:(?:import|export)\s+.*?|^})\s*from\s+["']([^"'.][^"']*)["']/gm
export const PY_IMPORT_RE = /(?:from\s+([\w.]+)\s+import|^import\s+([\w.]+))/gm

export const TS_TEST_RE = /\.test\.|\.spec\.|__tests__|e2e/
export const PY_TEST_RE = /test_|_test\.py|conftest/

export const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers",
  "tls", "trace_events", "tty", "url", "util", "v8", "vm",
  "wasi", "worker_threads", "zlib",
])

export const PY_STDLIB = new Set([
  "abc", "argparse", "ast", "asyncio", "base64", "bisect", "builtins",
  "calendar", "collections", "concurrent", "configparser", "contextlib",
  "copy", "csv", "ctypes", "dataclasses", "datetime", "decimal",
  "difflib", "email", "enum", "errno", "functools", "getpass", "glob",
  "gzip", "hashlib", "heapq", "hmac", "html", "http", "importlib",
  "inspect", "io", "itertools", "json", "logging", "math", "mimetypes",
  "multiprocessing", "operator", "os", "pathlib", "pickle", "platform",
  "pprint", "queue", "random", "re", "secrets", "select", "shelve",
  "shlex", "shutil", "signal", "socket", "sqlite3", "ssl", "string",
  "struct", "subprocess", "sys", "tempfile", "textwrap", "threading",
  "time", "timeit", "tomllib", "traceback", "typing", "unittest",
  "urllib", "uuid", "warnings", "weakref", "xml", "zipfile", "zlib",
])
