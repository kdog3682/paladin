// @paladin/bootstrap/bootstrap.ts
//
// Single self-contained bootstrap executable.
// Run on the target machine: bun ./bootstrap


import { chmod, mkdir, symlink, unlink } from "node:fs/promises"
import { join, dirname } from "node:path"
import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"

const HOME = process.env.HOME!
const DIRS = {
  dotfiles: join(HOME, "dotfiles"),
  projects: join(HOME, "projects"),
  scratch: join(HOME, "scratch"),
  documents: join(HOME, "documents"),
  trash: join(HOME, "trash"),
  ssh: join(HOME, ".ssh"),
}

const CHROME_EXT_DEST = "/mnt/chromeos/MyFiles/Downloads/claude-chat-downloader"

const SYMLINK_MAP: Record<string, string> = {
  ".gitconfig": join(HOME, ".gitconfig"),
  ".bashrc": join(HOME, ".bashrc"),
  ".bash_profile": join(HOME, ".bash_profile"),
  ".bash_aliases": join(HOME, ".bash_aliases"),
}

const DEFAULT_VARIABLES = [
  "#!/usr/bin/env bash",
  "# @paladin/bootstrap - shell variables",
  "",
  "export SCRATCHDIR='/home/kdog3682/scratch'",
  "export DLDIR='/mnt/chromeos/MyFiles/Downloads/'",
  "export USBDIR='/mnt/chromeos/removable/USB Drive'",
  "export DRIVEDIR='/mnt/chromeos/GoogleDrive/MyDrive'",
  "",
].join("\n")

const DEFAULT_ALIASES = [
  "#!/usr/bin/env bash",
  "# @paladin/bootstrap - default aliases",
  "",
  "[ -f ~/.env.sh ] && source ~/.env.sh",
  "[ -f ~/.variables.sh ] && source ~/.variables.sh",
  "",
  "alias claude='claude --dangerously-skip-permissions'",
  "alias ps='cd ~/projects/paladin && bun scaffold'",
  "alias pw='cd ~/projects/paladin && bun web'",
  "alias s='source ~/.bashrc'",
  "",
].join("\n")

// ---- helpers ----

function log(emoji: string, msg: string) {
  console.log(emoji + "  " + msg)
}

function run(cmd: string, args: string[] = []) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error("Command failed: " + cmd + " " + args.join(" "))
  }
}

function runQuiet(cmd: string, args: string[] = []): string {
  const result = spawnSync(cmd, args, {
    shell: true,
    env: process.env,
  })
  return (result.stdout ?? "").toString()
}

async function ensureDir(path: string) {
  if (!existsSync(path)) await mkdir(path, { recursive: true })
}

function commandExists(cmd: string): boolean {
  const result = spawnSync("which", [cmd], { shell: true })
  return result.status === 0
}

// ---- 1. install tools ----

async function installTools(): Promise<boolean> {
  log("🔧", "Installing tools...\n")
  let installed = false

  const tools = [
    {
      name: "bun",
      check: "bun",
      cmd: "curl -fsSL https://bun.sh/install | bash",
    },
    {
      name: "uv",
      check: "uv",
      cmd: "curl -LsSf https://astral.sh/uv/install.sh | sh",
    },
    {
      name: "vite",
      check: "vite",
      cmd: "bun install -g vite",
    },
    {
      name: "astro",
      check: "astro",
      cmd: "bun install -g astro",
    },
    {
      name: "typst",
      check: "typst",
      cmd: "curl -fsSL https://typst.app/install.sh | sh",
    },
    {
      name: "gh",
      check: "gh",
      cmd: "curl -sS https://webi.sh/gh | sh",
    },
    {
      name: "jq",
      check: "jq",
      cmd: `curl -fsSL https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 -o ${HOME}/.local/bin/jq && chmod +x ${HOME}/.local/bin/jq`,
    },
    {
      name: "rtk",
      check: "rtk",
      cmd: `curl -fsSL https://github.com/rtk-ai/rtk/releases/download/v0.31.0/rtk-x86_64-unknown-linux-musl.tar.gz | tar -xz -C /tmp && mv /tmp/rtk ${HOME}/.local/bin/rtk && chmod +x ${HOME}/.local/bin/rtk`,
    },
  ]

  for (const tool of tools) {
    if (commandExists(tool.check)) {
      log("  ✓", tool.name + " already installed")
    } else {
      log("  ↓", "Installing " + tool.name + "...")
      run(tool.cmd)
      log("  ✓", tool.name + " installed")
      installed = true
    }
  }
  console.log()
  return installed
}

// ---- 2. restore ssh ----

type Payload = Awaited<typeof import("./dist/__payload")>["PAYLOAD"]

async function restoreSSH(PAYLOAD: Payload) {
  const allExist = Object.keys(PAYLOAD.ssh).every(p => existsSync(join(DIRS.ssh, p)))
  if (allExist) {
    log("🔑", "SSH keys already restored, skipping\n")
    return
  }

  log("🔑", "Restoring SSH keys...\n")
  await ensureDir(DIRS.ssh)

  for (const [relativePath, file] of Object.entries(PAYLOAD.ssh)) {
    const dest = join(DIRS.ssh, relativePath)
    await ensureDir(dirname(dest))
    await Bun.write(dest, file.content)
    await chmod(dest, file.mode)
    log("  ✓", relativePath)
  }

  await chmod(DIRS.ssh, 0o700)

  const knownHostsPath = join(DIRS.ssh, "known_hosts")
  const knownHosts = existsSync(knownHostsPath)
    ? await Bun.file(knownHostsPath).text()
    : ""

  if (!knownHosts.includes("github.com")) {
    log("  +", "Adding github.com to known_hosts")
    const ghKeys = runQuiet("ssh-keyscan -t ed25519,rsa github.com 2>/dev/null")
    await Bun.write(knownHostsPath, knownHosts + "\n" + ghKeys)
  }

  console.log()
}

// ---- 3. restore + symlink dotfiles ----

async function restoreDotfiles(PAYLOAD: Payload) {
  const aliasesLinked = existsSync(SYMLINK_MAP[".bash_aliases"])
  const allLinked = Object.entries(PAYLOAD.dotfiles).every(([p]) => {
    const target = SYMLINK_MAP[p]
    return !target || existsSync(target)
  })

  if (aliasesLinked && allLinked && existsSync(join(HOME, ".variables.sh"))) {
    log("📂", "Dotfiles already restored, skipping\n")
    return
  }

  log("📂", "Restoring and symlinking dotfiles...\n")
  await ensureDir(DIRS.dotfiles)

  // write default aliases if not packed from source
  if (!PAYLOAD.dotfiles[".bash_aliases"]) {
    const dest = join(DIRS.dotfiles, ".bash_aliases")
    await Bun.write(dest, DEFAULT_ALIASES)
    log("  +", "Created default .bash_aliases")

    const target = SYMLINK_MAP[".bash_aliases"]
    await ensureDir(dirname(target))
    if (existsSync(target)) await unlink(target)
    await symlink(dest, target)
    log("  🔗", ".bash_aliases → ~/.bash_aliases")
  }

  for (const [relativePath, file] of Object.entries(PAYLOAD.dotfiles)) {
    const dest = join(DIRS.dotfiles, relativePath)
    await ensureDir(dirname(dest))
    await Bun.write(dest, file.content)
    await chmod(dest, file.mode)

    const target = SYMLINK_MAP[relativePath]
    if (target) {
      await ensureDir(dirname(target))
      if (existsSync(target)) await unlink(target)
      await symlink(dest, target)
      log("  🔗", relativePath + " → ~/" + relativePath)
    } else {
      log("  ✓", relativePath)
    }
  }

  // ensure .bashrc sources aliases
  const bashrcPath = join(HOME, ".bashrc")
  if (existsSync(bashrcPath)) {
    const content = await Bun.file(bashrcPath).text()
    if (!content.includes(".bash_aliases")) {
      await Bun.write(
        bashrcPath,
        content + "\n\n# bootstrap: load aliases\n[ -f ~/.bash_aliases ] && source ~/.bash_aliases\n"
      )
      log("  ✓", "Added aliases source line to ~/.bashrc")
    }
  }

  // write ~/.variables.sh
  const varsPath = join(HOME, ".variables.sh")
  if (!existsSync(varsPath)) {
    await Bun.write(varsPath, DEFAULT_VARIABLES)
    log("  +", "Created ~/.variables.sh")
  }

  console.log()
}

// ---- 4. write .env.sh ----

async function writeEnvSh(PAYLOAD: Payload) {
  if (!PAYLOAD.envSh) {
    log("⚠️", "No .env.sh in payload, skipping\n")
    return
  }

  const envShPath = join(HOME, ".env.sh")
  if (existsSync(envShPath)) {
    log("🌐", "~/.env.sh already exists, skipping\n")
    return
  }

  log("🌐", "Writing ~/.env.sh...\n")
  await Bun.write(envShPath, PAYLOAD.envSh)
  log("  ✓", envShPath)
  console.log()
}

// ---- 5. restore chrome extension ----

async function restoreChromeExt(PAYLOAD: Payload) {
  log("🧩", "Restoring Chrome extension...\n")

  const parentDir = dirname(CHROME_EXT_DEST)
  if (!existsSync(parentDir)) {
    log("  ⚠️", "Parent dir not found: " + parentDir + " — skipping Chrome extension")
    console.log()
    return
  }

  if (!existsSync(CHROME_EXT_DEST)) {
    await mkdir(CHROME_EXT_DEST, { recursive: true })
  }

  for (const [relativePath, file] of Object.entries(PAYLOAD.chromeExt)) {
    const dest = join(CHROME_EXT_DEST, relativePath)
    const destParent = dirname(dest)
    if (!existsSync(destParent)) {
      await mkdir(destParent, { recursive: true })
    }
    await Bun.write(dest, file.content)
    await chmod(dest, file.mode)
    log("  ✓", relativePath)
  }
  console.log()
}

// ---- 6. clone repos ----

async function cloneRepos(): Promise<boolean> {
  log("📡", "Cloning repositories...\n")
  await ensureDir(DIRS.projects)

  const repos = ["kdog3682/paladin"]
  let freshlyCloned = false

  for (const repo of repos) {
    const name = repo.split("/").pop()!
    const dest = join(DIRS.projects, name)

    if (existsSync(dest)) {
      log("  ✓", repo + " (already cloned)")
    } else {
      log("  ↓", "Cloning " + repo + "...")
      run("git", ["clone", "git@github.com:" + repo + ".git", dest])
      log("  ✓", repo)
      if (name === "paladin") freshlyCloned = true
    }
  }
  console.log()
  return freshlyCloned
}

// ---- 7. run paladin scaffold ----

function runScaffold() {
  log("🏗️", "Running paladin scaffold...\n")
  const paladinDir = join(DIRS.projects, "paladin")

  if (!existsSync(paladinDir)) {
    log("  ⚠️", "Paladin not found, skipping scaffold")
    console.log()
    return
  }

  const bunPath = join(HOME, ".bun/bin/bun")
  const bun = existsSync(bunPath) ? bunPath : "bun"

  log("  ↓", "Installing dependencies...")
  spawnSync(bun, ["install"], {
    stdio: "inherit",
    cwd: paladinDir,
    shell: true,
    env: process.env,
  })

  log("  ↓", "Running scaffold...")
  spawnSync(bun, ["scaffold"], {
    stdio: "inherit",
    cwd: paladinDir,
    shell: true,
    env: process.env,
  })
  console.log()
}

// ---- main ----

async function main() {
  console.log("\n🚀 Bootstrap\n" + "─".repeat(40) + "\n")

  for (const dir of Object.values(DIRS)) {
    await ensureDir(dir)
  }

  const toolsInstalled = await installTools()
  const { PAYLOAD } = await import("./dist/__payload").catch(() => ({
    PAYLOAD: { ssh: {}, dotfiles: {}, chromeExt: {}, envSh: "" } as const,
  }))
  await restoreSSH(PAYLOAD)
  await restoreDotfiles(PAYLOAD)
  await writeEnvSh(PAYLOAD)
  await restoreChromeExt(PAYLOAD)
  const freshlyCloned = await cloneRepos()
  if (freshlyCloned) runScaffold()

  console.log("─".repeat(40))
  log("🎉", "Bootstrap complete!\n")
  if (toolsInstalled || freshlyCloned) {
    log("  ", "Restart your shell or run: source ~/.bashrc\n")
  }
}

main()
