/**
 * Resolve a relative import specifier (e.g. "./foo", "../bar.js") from
 * `fromDir` to an absolute file path. Package specifiers and unresolvable
 * imports return null.
 */
export function resolveRelativeImport(fromDir: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null
  try {
    return Bun.resolveSync(specifier, fromDir)
  } catch {
    return null
  }
}
