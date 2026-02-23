// @paladin/ai/omni/utils/fs.ts

import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { $ } from "bun"

export async function readFile(path: string): Promise<string> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(`File not found: ${path}`)
  }
  return file.text()
}

export async function writeFile(path: string, content: string): Promise<number> {
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, content)
  return content.length
}

export async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}

export async function listFiles(
  directory = ".",
  recursive = false
): Promise<string[]> {
  const cmd = recursive
    ? `find ${directory} -type f -not -path '*/node_modules/*' -not -path '*/.git/*'`
    : `ls -1 ${directory}`
  const result = await $`sh -c ${cmd}`.quiet().nothrow()
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
}

export async function shell(
  command: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await $`sh -c ${command}`
    .cwd(cwd ?? process.cwd())
    .quiet()
    .nothrow()
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  }
}
