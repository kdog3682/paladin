// @paladin/conversation-processor/utils/path.mochi.ts

import { resolvePath, extractPackageInfo } from "./path"

const BASE = "/tmp/projects"

/* resolvePath: scoped package paths */
export function scopedPackagePaths() {
  return [
    resolvePath("@acme/fcache/src/utils.ts", BASE),
    // → /tmp/projects/acme/packages/fcache/src/utils.ts

    resolvePath("@acme/web/src/routes/home.ts", BASE),
    // → /tmp/projects/acme/packages/web/src/routes/home.ts

    resolvePath("@acme/fcache/readme.md", BASE),
    // → /tmp/projects/acme/packages/fcache/readme.md
  ]
}

/* resolvePath: root-level files */
export function rootLevelFiles() {
  return [
    resolvePath("@acme/readme.md", BASE),
    // → /tmp/projects/acme/readme.md

    resolvePath("@acme/tsconfig.json", BASE),
    // → /tmp/projects/acme/tsconfig.json
  ]
}

/* paths that resolve to null because they lack a file */
export function invalidPaths() {
  return [
    resolvePath("@acme", BASE),
    // → null

    resolvePath("@acme/", BASE),
    // → null

    resolvePath("@acme/foobar", BASE),
    // → null (no file extension, ambiguous)
  ]
}

/* relative paths throw an error */
export function relativePaths() {
  try {
    resolvePath("./local/file.ts", BASE)
  } catch (e) {
    return (e as Error).message
    // → "relative paths not allowed: ./local/file.ts"
  }
}

/* absolute paths pass through unchanged */
export function absolutePaths() {
  return [
    resolvePath("/home/user/file.ts", BASE),
    // → /home/user/file.ts
  ]
}

/* home-relative paths expand the tilde */
export function homeRelativePaths() {
  return [
    resolvePath("~/docs/notes.md", BASE),
    // → /home/<user>/docs/notes.md
  ]
}

/* extractPackageInfo: package files */
export function packageFiles() {
  const root = "/tmp/projects/acme"
  return [
    extractPackageInfo("/tmp/projects/acme/packages/fcache/src/utils.ts", root),
    // → { packageName: "fcache", filePath: "src/utils.ts" }

    extractPackageInfo("/tmp/projects/acme/packages/web/index.ts", root),
    // → { packageName: "web", filePath: "index.ts" }
  ]
}

/* extractPackageInfo: root files return null */
export function rootFiles() {
  const root = "/tmp/projects/acme"
  return [
    extractPackageInfo("/tmp/projects/acme/readme.md", root),
    // → null

    extractPackageInfo("/tmp/projects/acme/tsconfig.json", root),
    // → null
  ]
}
