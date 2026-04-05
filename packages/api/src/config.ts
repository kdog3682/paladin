// @paladin/packages/api/src/config.ts

import { join } from "path"
import { homedir } from "os"

const home = homedir()

export const config = {
  watchDir: join(home, "scratch"),
  baseProjectsDir: join(home, "projects"),
  bunDepCacheDir: join(home, ".cache", "paladin", "dep-versions.json"),
  port: Number(process.env.PORT) || 3000,
}
