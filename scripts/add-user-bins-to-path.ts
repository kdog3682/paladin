/**
 * Permanently adds ~/.local/bin and ~/.bun/bin to PATH for GUI-launched
 * apps (Sublime, app launchers, etc), not just interactive shells.
 *
 * Writes to ~/.config/environment.d/envvars.conf (systemd user env).
 * Safe to re-run: skips if already applied, backs up the file before
 * any write, and never clobbers an existing PATH= line.
 *
 * Run: bun add-user-bins-to-path.ts
 * Then log out/in (or reboot) for it to take effect.
 */

import { mkdir, readFile, writeFile, copyFile } from "fs/promises"
import { existsSync } from "fs"
import { homedir } from "os"
import path from "path"

const HOME = homedir()
const ENV_DIR = path.join(HOME, ".config", "environment.d")
const ENV_FILE = path.join(ENV_DIR, "envvars.conf")
const EXTRA_PATHS = [
  path.join(HOME, ".local", "bin"),
  path.join(HOME, ".bun", "bin"),
]

async function main() {
  if (!existsSync(ENV_DIR)) {
    await mkdir(ENV_DIR, { recursive: true })
  }

  const pathsJoined = EXTRA_PATHS.join(":")
  const newLine = `PATH=${pathsJoined}:$PATH`

  let existing = ""
  if (existsSync(ENV_FILE)) {
    existing = await readFile(ENV_FILE, "utf8")
  }

  // already there, nothing to do
  if (existing.includes(pathsJoined)) {
    console.log("PATH entries already present, skipping")
    return
  }

  const lines = existing.split("\n")
  const existingPathLineIdx = lines.findIndex((l) => /^PATH=/.test(l.trim()))

  // back up before touching anything, if file exists
  if (existing) {
    const backupFile = `${ENV_FILE}.bak.${Date.now()}`
    await copyFile(ENV_FILE, backupFile)
    console.log(`Backed up existing file to ${backupFile}`)
  }

  let output: string
  if (existingPathLineIdx !== -1) {
    // a PATH= line already exists (possibly custom) - don't clobber it, append ours after it
    console.log(`Found existing PATH line: "${lines[existingPathLineIdx].trim()}"`)
    console.log("Leaving it intact and adding a second PATH= line after it")
    lines.splice(existingPathLineIdx + 1, 0, newLine)
    output = lines.join("\n")
  } else {
    output = existing.length ? `${existing.replace(/\n?$/, "\n")}${newLine}\n` : `${newLine}\n`
  }

  await writeFile(ENV_FILE, output)
  console.log(`Wrote PATH entries to ${ENV_FILE}`)
  console.log("Log out and back in (or reboot) for it to take effect system-wide")
}

main()
