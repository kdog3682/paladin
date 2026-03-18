#!/usr/bin/env bun
// @paladin/scripts/apply-latest-conversation.js

import { readdirSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const scratchDir = join(homedir(), "scratch")

// --- path extraction (standalone) ---

const NON_SRC_FILES = [
  "readme.md", "readme", "package.json", "tsconfig.json", "tsconfig",
  ".eslintrc", ".eslintrc.js", ".eslintrc.json",
  "eslint.config.js", "eslint.config.ts", "eslint.config.mjs",
  ".prettierrc", ".prettierrc.json", "prettier.config.js",
  ".gitignore", ".env", ".env.local", ".env.example",
  "dockerfile", "docker-compose.yml", "docker-compose.yaml",
  "vite.config.ts", "vite.config.js",
  "next.config.ts", "next.config.js", "next.config.mjs",
  "astro.config.ts", "astro.config.mjs",
  "tailwind.config.ts", "tailwind.config.js",
  "postcss.config.js", "postcss.config.ts", "postcss.config.mjs",
  "biome.json", "biome.jsonc", "bunfig.toml", "turbo.json",
  "claude.md", "agents.md", "agents.yaml", "agents.yml", ".claude",
  "license", "license.md", "changelog.md", "contributing.md",
]

const WORKSPACES = ["apps", "packages"]
const BASE_DIR = join(homedir(), "projects")

function extractPath(content) {
  const lines = content.split("\n")
  const max = Math.min(lines.length, 3)

  for (let i = 0; i < max; i++) {
    const line = lines[i].trim()
    if (
      line === "'use client'" || line === '"use client"' ||
      line === "'use server'" || line === '"use server"' ||
      line.startsWith("#!")
    ) continue

    const match = line.match(/^\/\/\s*(@[^\s]+)/)
    if (!match) continue

    const raw = match[1]
    const after = line.slice(line.indexOf(raw) + raw.length).trim()
    if (after.length > 0 && !after.startsWith("//")) return null
    if (raw.includes("./") || raw.includes("../")) return null
    if (raw.split("/").length < 2) return null

    return raw
  }
  return null
}

function resolvePath(rawPath) {
  const parts: string[] = rawPath.split("/")
  if (!WORKSPACES.includes(parts[1])) {
    parts.splice(1, 0, 'packages')
  }
  const orgName = parts[0].slice(1)
  const rest = parts.slice(1)
  const root = join(BASE_DIR, orgName)
  const filename = rest[rest.length - 1]

  const normalized = [...rest]
  if (filename.toLowerCase() === "readme.md" || filename.toLowerCase() === "readme") {
    normalized[normalized.length - 1] = "README.md"
  }

  let topDir = rest[0]
  const isWorkspace = WORKSPACES.includes(topDir)
  const isNonSrc = NON_SRC_FILES.some(f => filename.toLowerCase() === f || filename.toLowerCase().startsWith(f + "."))
  const shouldInjectSrc = isWorkspace && rest.length > 2 && !isNonSrc

  if (shouldInjectSrc) {
    const pkgPath = rest.slice(0, 2).join("/")
    const filePath = normalized.slice(2).join("/")
    if (filePath.includes('src') || pkgPath.includes('src')) {
    return join(root, pkgPath, filePath)

    }
    return join(root, pkgPath, "src", filePath)
  }
  return join(root, normalized.join("/"))
}

// --- main ---

const files = readdirSync(scratchDir)
  .filter(f => f.endsWith(".json") && f.includes("__CODE__"))
  .map(f => ({ name: f, path: join(scratchDir, f), mtime: Bun.file(join(scratchDir, f)).lastModified }))
  .sort((a, b) => b.mtime - a.mtime)

if (!files.length) {
  console.error("No conversation*.json found in ~/scratch")
  process.exit(1)
}

const latest = files[0]
console.log(`Using: ${latest.name}`)

const conversation = JSON.parse(readFileSync(latest.path, "utf-8"))
const artifacts = conversation.artifacts ?? []

let written = 0
let skipped = 0


for (const artifact of artifacts) {
  const raw = extractPath(artifact.content ?? "")
  if (!raw) {
    skipped++
    continue
  }

  const resolved = resolvePath(raw)
  await Bun.write(resolved, artifact.content)
  written++
  console.log(`${resolved}`)
}

console.log(`\n${written} written, ${skipped} skipped.`)
