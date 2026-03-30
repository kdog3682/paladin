// @paladin/scaffold-v3/scaffold/matchers/bootstrap.ts

import { hydrate } from "../bootstrap"
import type { Matcher } from "./types"

/**
 * bootstrap a new package from a template inferred by file extensions.
 * only fires for new packages.
 */
export const bootstrapMatcher: Matcher = async (pkg) => {
  if (!pkg.isNew) return { matched: false }

  let key: string | undefined
  for (const f of pkg.files) {
    if (f.absolutePath.endsWith(".astro")) { key = "astro"; break }
    if (f.absolutePath.endsWith(".tsx")) { key = "web"; break }
  }

  const created = await hydrate({
    dir: pkg.packageDir,
    projectName: pkg.projectName,
    packageName: pkg.packageName,
    key,
  })

  return { matched: true, filesCreated: created }
}
