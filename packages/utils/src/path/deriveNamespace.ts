/*
derives a package's namespace and root from any path inside it.

  deriveNamespace("/tmp/foobar/asdf/a/packages/b/src/foo.examples.ts")
  // { namespace: "@a/b", root: "/tmp/foobar/asdf/a/packages/b" }

the segment before `packages` or `apps` is the scope, the segment after
is the package name. the last occurrence wins, so nested workspaces
resolve to the innermost package.
*/

export type Namespace = {
  namespace: string
  root: string
}

const SEGMENTS = new Set(["packages", "apps"])

export function deriveNamespace(path: string): Namespace {
  const parts = path.split("/")
  const i = parts.findLastIndex((p) => SEGMENTS.has(p))
  if (i < 1 || i + 1 >= parts.length) {
    throw new Error(`cannot derive namespace from ${path}: no packages/apps segment`)
  }
  return {
    namespace: `@${parts[i - 1]}/${parts[i + 1]}`,
    root: parts.slice(0, i + 2).join("/"),
  }
}
