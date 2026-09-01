/*
derives a package's namespace and root from any path inside it.

  const { namespace, root, getRelpath } = deriveNamespace(
    "/tmp/foobar/asdf/a/packages/b/src/foo.examples.ts",
  )
  // { namespace: "@a/b", root: "/tmp/foobar/asdf/a/packages/b" }
  getRelpath("/tmp/foobar/asdf/a/packages/b/src/foo.examples.ts") // "src/foo.examples.ts"

the segment before `packages` or `apps` is the scope, the segment after
is the package name. the last occurrence wins, so nested workspaces
resolve to the innermost package.
*/

export type Namespace = {
  namespace: string
  root: string
  /* strips the root prefix off a path inside the package, passes anything else through */
  getRelpath: (path: string) => string
}

const SEGMENTS = new Set(["packages", "apps"])

export function deriveNamespace(path: string): Namespace {
  const parts = path.split("/")
  const i = parts.findLastIndex((p) => SEGMENTS.has(p))
  if (i < 1 || i + 1 >= parts.length) {
    throw new Error(`cannot derive namespace from ${path}: no packages/apps segment`)
  }
  const root = parts.slice(0, i + 2).join("/")
  return {
    namespace: `@${parts[i - 1]}/${parts[i + 1]}`,
    root,
    getRelpath: (p) => (p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p),
  }
}
