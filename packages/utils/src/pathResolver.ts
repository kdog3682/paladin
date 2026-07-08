import { homedir } from "os"
import { join } from "path"

/**
 * Resolves a `@project/pkg/...` path to an absolute src path.
 * Non-`@` paths are returned unchanged. Extra segments are appended.
 * @example pathResolver("@a/b", "foo.ts") // ~/projects/a/packages/b/src/foo.ts
 */
export function pathResolver(path: string, ...args: string[]): string {
  if (!path.startsWith("@")) return join(path, ...args)

  const [project, pkg, ...rest] = path.slice(1).split("/")
  if (!project || !pkg) throw new Error(`invalid path: ${path}`)

  return join(homedir(), "projects", project, "packages", pkg, "src", ...rest, ...args)
}
