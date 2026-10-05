import { basename, dirname, hasExtension, isWithin, join, normalize } from "./paths"

export type RenameResult = { ok: true, to: string } | { ok: false, reason: string }

export type ResolveRenameOpts = {
  /* absolute path being renamed */
  from: string
  /* what the user typed. relative to the entry's parent dir, ie "bar.ts", "../expr", "../expr/" */
  input: string
  kind: "file" | "dir"
  /* package root. targets must stay inside it */
  root: string
  /* whether a path already exists */
  exists: (path: string) => boolean
}

const fail = (reason: string): RenameResult => ({ ok: false, reason })

/*
 * a trailing slash moves the entry into that folder keeping its name, ie "../expr/" -> ../expr/<name>.
 * the presence of an extension decides file vs folder, so a file cannot become a folder and vice versa.
 */
export function resolveRename({ from, input, kind, root, exists }: ResolveRenameOpts): RenameResult {
  let raw = input.trim()
  if (!raw) return fail("name cannot be empty")
  if (raw.endsWith("/")) raw += basename(from)

  const to = raw.startsWith("/") ? normalize(raw) : join(dirname(from), raw)
  if (to === from) return fail("name is unchanged")
  if (!isWithin(root, to) || to === root) return fail("target is outside the package")

  if (kind === "file" && !hasExtension(to))
    return fail(`a file cannot be renamed into a folder ("${basename(to)}" has no extension)`)
  if (kind === "dir" && hasExtension(to))
    return fail(`a folder cannot be renamed into a file ("${basename(to)}" has an extension)`)
  if (kind === "dir" && isWithin(from, to)) return fail("a folder cannot be moved into itself")
  if (exists(to)) return fail(`${basename(to)} already exists`)

  return { ok: true, to }
}

const IDENT = /^[A-Za-z_$][\w$]*$/

export function validateIdentifier(name: string): string | null {
  if (!name) return "name cannot be empty"
  if (!IDENT.test(name)) return `"${name}" is not a valid identifier`
  return null
}
