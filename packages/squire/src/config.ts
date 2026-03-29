// @paladin/squire/src/config.ts

import { join } from "path"

type SquireConfig = {
  default?: { pkg: string, pkgDir: string }
}

async function readConfig(root: string): Promise<SquireConfig> {
  const file = Bun.file(join(root, ".squire.json"))
  if (!(await file.exists())) return {}
  return file.json()
}

async function writeConfig(root: string, config: SquireConfig): Promise<void> {
  await Bun.write(join(root, ".squire.json"), JSON.stringify(config, null, 2) + "\n")
}

export async function getDefaultPkg(root: string): Promise<{ pkg: string, pkgDir: string } | null> {
  const config = await readConfig(root)
  return config.default ?? null
}

export async function setDefaultPkg(root: string, pkg: string, pkgDir: string): Promise<void> {
  const config = await readConfig(root)
  config.default = { pkg, pkgDir }
  await writeConfig(root, config)
}

export async function clearDefaultPkg(root: string): Promise<void> {
  const config = await readConfig(root)
  delete config.default
  await writeConfig(root, config)
}
