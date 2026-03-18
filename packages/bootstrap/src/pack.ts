// @paladin/bootstrap/pack.ts
//
// Run on the source machine:
//   bun run pack.ts
//
// Scans for common configs + .ssh, generates .env.sh from ~/.env,
// embeds everything into a single self-extracting bootstrap executable,
// and saves it to the Chromebook USB drive.

import { $ } from "bun"
import { readdir, stat } from "node:fs/promises"
import { join, dirname, resolve } from "node:path"
import { existsSync } from "node:fs"

const HOME = process.env.HOME!
const USB_PATH = "/mnt/chromeos/removable/USB Drive"
const CHROME_EXT = "/mnt/chromeos/MyFiles/Downloads/claude-chat-downloader"
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const BOOTSTRAP_SRC = join(SCRIPT_DIR, "bootstrap.ts")
const TMP_PAYLOAD = join(SCRIPT_DIR, "dist/__payload.ts")

// ---- common dotfiles to scan for ----

const DOTFILE_CANDIDATES = [
  ".bashrc",
  ".zshrc",
  ".bash_profile",
  ".zprofile",
  ".profile",
  ".gitconfig",
  ".gitignore_global",
  ".vimrc",
  ".tmux.conf",
  ".wezterm.lua",
  ".npmrc",
  ".yarnrc.yml",
  ".config/starship.toml",
  ".config/alacritty/alacritty.toml",
  ".config/alacritty/alacritty.yml",
  ".config/kitty/kitty.conf",
  ".config/wezterm/wezterm.lua",
  ".config/nvim/init.lua",
  ".config/nvim/init.vim",
  ".config/fish/config.fish",
  ".config/helix/config.toml",
  ".config/zed/settings.json",
]

// ---- helpers ----

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`)
}

async function collectDir(dir: string, prefix = ""): Promise<Record<string, { content: string, mode: number }>> {
  const entries: Record<string, { content: string, mode: number }> = {}
  if (!existsSync(dir)) return entries

  const items = await readdir(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = join(dir, item.name)
    const key = prefix ? `${prefix}/${item.name}` : item.name

    if (item.isDirectory()) {
      Object.assign(entries, await collectDir(fullPath, key))
    } else {
      const info = await stat(fullPath)
      const content = await Bun.file(fullPath).text()
      entries[key] = { content, mode: info.mode }
    }
  }
  return entries
}

// ---- main ----

async function pack() {
  console.log("\n📦 Packing source machine\n" + "─".repeat(40) + "\n")

  // 1. collect .ssh
  const ssh = await collectDir(join(HOME, ".ssh"))
  log("🔑", `SSH: ${Object.keys(ssh).length} files`)

  // 2. scan for dotfiles
  const dotfiles: Record<string, { content: string, mode: number }> = {}
  for (const candidate of DOTFILE_CANDIDATES) {
    const fullPath = join(HOME, candidate)
    if (existsSync(fullPath)) {
      const info = await stat(fullPath)
      if (info.isFile()) {
        dotfiles[candidate] = {
          content: await Bun.file(fullPath).text(),
          mode: info.mode,
        }
        log("  ✓", candidate)
      }
    }
  }
  log("📂", `Dotfiles: ${Object.keys(dotfiles).length} found\n`)

  // 3. collect chrome extension
  const chromeExt = await collectDir(CHROME_EXT)
  log("🧩", `Chrome extension: ${Object.keys(chromeExt).length} files`)

  // 4. generate .env.sh from ~/.env
  let envSh = ""
  const envPath = join(HOME, ".env")
  if (existsSync(envPath)) {
    const envContent = await Bun.file(envPath).text()
    const lines = envContent
      .split("\n")
      .filter(l => l.trim() && !l.startsWith("#"))

    const exports = lines.map(line => {
      const [key, ...rest] = line.split("=")
      return `export ${key.trim()}=${rest.join("=").trim()}`
    }).join("\n")

    envSh = `#!/usr/bin/env bash\n# Auto-generated from ~/.env\n\n${exports}\n`
    log("🌐", "Generated .env.sh from ~/.env")
  } else {
    log("⚠️", "No ~/.env found, skipping env generation")
  }

  // 5. embed payload into bootstrap source
  const payload = { ssh, dotfiles, chromeExt, envSh }
  const payloadModule = `// auto-generated payload\nexport const PAYLOAD = ${JSON.stringify(payload)} as const\n`

  await $`mkdir -p ${dirname(TMP_PAYLOAD)}`
  await Bun.write(TMP_PAYLOAD, payloadModule)

  // 6. compile single executable
  const DRIVE_PATH = "/mnt/chromeos/GoogleDrive/MyDrive"

  let outDir: string
  if (existsSync(USB_PATH)) {
    outDir = USB_PATH
    log("💾", "Saving to USB drive")
  } else if (existsSync(DRIVE_PATH)) {
    outDir = DRIVE_PATH
    log("☁️", "USB not found, saving to Google Drive")
  } else {
    console.error("❌ Neither USB drive nor Google Drive found. Plug in a USB or mount Drive.")
    process.exit(1)
  }
  const outPath = join(outDir, "bootstrap")

  log("🔨", "Compiling single executable...")
  await $`bun build ${BOOTSTRAP_SRC} --compile --outfile ${outPath}`

  // cleanup tmp payload
  await $`rm ${TMP_PAYLOAD}`

  console.log("\n✅ Done!")
  console.log(`   ${outPath}\n`)
  console.log("Copy to the target machine and run: ./bootstrap\n")
}

pack()
