#!/usr/bin/env bun

const EXT_DIR = "apps/claude-chat-downloader"
const pkgPath = `${EXT_DIR}/package.json`
const manifestPath = `${EXT_DIR}/manifest.json`

const pkg = JSON.parse(await Bun.file(pkgPath).text()) as { version?: string }
const manifest = JSON.parse(await Bun.file(manifestPath).text()) as { version?: string }

if (!pkg.version) {
  throw new Error(`Missing version in ${pkgPath}`)
}

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`synced manifest version -> ${pkg.version}`)
} else {
  console.log(`manifest already synced at ${pkg.version}`)
}
