// test-runner.ts
import { $ } from "bun"
import { parseArgs } from "util"
import { resolve, join, dirname } from "path"
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "fs"
import { tmpdir } from "os"
import { globSync } from "glob"

type OpenMode = "claude" | "file"

interface RunTestsParams {
  filePath: string
  command?: string
  cwd?: string
  open?: OpenMode
}

function findClosestPackageJson(from: string): string | null {
  let current = existsSync(from) && !Bun.file(from).name?.includes(".")
    ? from
    : dirname(from)

  while (current !== dirname(current)) {
    const candidate = join(current, "package.json")
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  return null
}

function findTypesFiles(dir: string): string[] {
  return [
    ...globSync(join(dir, "types.ts")),
    ...globSync(join(dir, "*.types.ts")),
  ]
}

function extractErroringFiles(output: string, packageDir: string): string[] {
  const patterns = [
    /(?:FAIL|ERROR|error)\s+(.+?\.[tj]sx?)/g,
    /([^\s]+?\.[tj]sx?)[\s:(]\d+/g,
    /at\s+.*?\((.+?\.[tj]sx?):\d+:\d+\)/g,
  ]

  const files = new Set<string>()

  for (const pattern of patterns) {
    for (const match of output.matchAll(pattern)) {
      const raw = match[1].trim()
      const fromPkg = resolve(packageDir, raw)
      const absolute = resolve(raw)

      if (existsSync(fromPkg)) files.add(fromPkg)
      else if (existsSync(absolute)) files.add(absolute)
    }
  }

  return [...files].sort()
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8")
  } catch (e) {
    return `[Could not read: ${e}]`
  }
}

async function openAsFile(prompt: string) {
  const tmpDir = mkdtempSync(join(tmpdir(), "test-runner-"))
  const tmpFile = join(tmpDir, "prompt.md")
  writeFileSync(tmpFile, prompt, "utf-8")
  console.log(`\n📄 Prompt written to: ${tmpFile}`)
  await $`open ${tmpFile}`.quiet()
}

async function runTests({
  filePath,
  command = "bun test",
  open = "claude",
}: RunTestsParams) {
  const resolved = resolve(filePath)
  const pkgJson = findClosestPackageJson(resolved)
  const discoveredDir = pkgJson ? dirname(pkgJson) : null
  const workDir = discoveredDir

  if (!workDir) {
    console.error(`No package.json found for ${filePath} and no --cwd provided`)
    process.exit(1)
  }

  console.log(`📁 Working directory: ${workDir}`)
  console.log(`🧪 Running: ${command}\n`)

  const [cmd, ...args] = command.split(" ")
  const proc = Bun.spawnSync(args.length ? [cmd, ...args] : [cmd], {
    cwd: workDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" },
  })

  const stdout = proc.stdout.toString()
  const stderr = proc.stderr.toString()
  const combinedOutput = `${stdout}\n${stderr}`.trim()

  if (proc.exitCode === 0) {
    console.log("✅ All tests passed!\n")
    console.log(combinedOutput)
    return
  }

  // console.log("❌ Tests failed.\n")
  // console.log(combinedOutput)

  const erroringFiles = extractErroringFiles(combinedOutput, workDir)
  const typesFiles = findTypesFiles(workDir)
  const allFiles = [...new Set([...erroringFiles, ...typesFiles])]

  // console.log(`\nCollected ${erroringFiles.length} erroring file(s) and ${typesFiles.length} types file(s)`)
  // for (const f of allFiles) console.log(`  → ${f}`)

  const fileContents = allFiles
    .map((f) => `--- ${f} ---\n${readFileSafe(f)}`)
    .join("\n\n")

  const prompt = `The following tests failed. Please help me fix them.

## Test Output
\`\`\`
${combinedOutput}
\`\`\`

## Relevant Files
`

  writeFileSync('/tmp/abc.txt', prompt)
}

// --- CLI ---


await runTests({
  filePath: "/home/kdog3682/projects/paladin/packages/conversation/src/tests/diverse-imports-conversation.test.ts",
  command: 'bun test:analyze',
  open: 'file'
})
