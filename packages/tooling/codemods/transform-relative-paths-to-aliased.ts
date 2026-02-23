import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const codemodDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(codemodDir, "../../..")
const transform = resolve(codemodDir, "transform-relative-paths-to-aliased.transform.cjs")
const target = resolve(repoRoot, "apps/web/src")

const child = spawn(
  "bunx",
  [
    "jscodeshift",
    "-t",
    transform,
    target,
    "--extensions=ts,tsx,js,jsx,mjs,cjs",
    "--parser=tsx",
    "--verbose=1",
  ],
  { stdio: "inherit", cwd: repoRoot }
)

child.on("exit", (code) => {
  process.exit(code ?? 1)
})
