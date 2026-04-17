import { resolvePath } from "../../processors/claude/utils/resolve-path"
import type { WireContext } from "./types"

export function buildContext(): WireContext {
  return {
    webAppPath: resolvePath("@paladin/web/src/App.tsx"),
    apiRoutesIndexPath: resolvePath(
      "@paladin/api/src/routes/index.ts",
    ),
    appletsDir: resolvePath("@paladin/web/src/components/applets"),
  }
}

export function isAppletPath(p: string) {
  return /\/components\/applets\/[^/]+(?:\/index)?\.tsx?$/.test(
    p.replace(/\\/g, "/"),
  )
}

export function appletNameFromPath(p: string) {
  const n = p.replace(/\\/g, "/")
  const folder = n.match(/\/applets\/([^/]+)\/index\.tsx?$/)
  if (folder) return folder[1]
  const file = n.match(/\/applets\/([^/]+)\.tsx?$/)
  return file ? file[1] : ""
}

export function isFeatureService(p: string) {
  const n = p.replace(/\\/g, "/")
  const m = n.match(/\/features\/([^/]+)\/([^/]+)\.service\.ts$/)
  return !!m && m[1] === m[2]
}

export function featureNameFromPath(p: string) {
  const n = p.replace(/\\/g, "/")
  const m = n.match(/\/features\/([^/]+)\/\1\.service\.ts$/)
  return m ? m[1] : ""
}

export function isDbFile(p: string) {
  const n = p.replace(/\\/g, "/")
  return /\/db\.ts$/.test(n) || /\/db\/(schema|database)\.ts$/.test(n)
}

export function pascal(s: string) {
  return s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase())
}

export function kebab(s: string) {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
}
