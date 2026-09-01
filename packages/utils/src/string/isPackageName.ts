/** npm's own rules: scope optional, lowercase, no leading dot or underscore, 214 max. */
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/**
 * Whether a string could name a package on the registry. Cheap gate in front of a
 * fetch, so a specifier scraped out of source — a regex literal, a fragment of a
 * template string — fails locally instead of as a confusing registry miss.
 */
export function isPackageName(value: string): boolean {
  if (!value || value.length > 214) return false
  if (value.startsWith(".") || value.startsWith("_")) return false
  return PACKAGE_NAME.test(value)
}
