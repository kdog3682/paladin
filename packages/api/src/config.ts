// src/config.ts
import { join } from "path"
import { homedir } from "os"

const home = !!process.env.TESTING
  ? process.env.TMP_DIR!
  : homedir()

  const HOME = homedir()
export const config = {
  watchDir: join(HOME, "scratch"),
  baseProjectsDir: join(home, "projects"),
  fileCacheBase: join(home, ".cache", "paladin", "fcache"),
  npmCachePath: join(HOME, ".cache", "paladin", "dep-versions.json"),
  bunDepCacheDir: join(HOME, ".cache", "paladin", "dep-versions.json"),
  port: Number(process.env.PORT) || 3000,
}