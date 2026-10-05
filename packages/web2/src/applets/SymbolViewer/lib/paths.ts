export function normalize(p: string): string {
  const abs = p.startsWith("/")
  const out: string[] = []
  for (const part of p.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop()
      else if (!abs) out.push("..")
      continue
    }
    out.push(part)
  }
  const joined = out.join("/")
  return abs ? `/${joined}` : joined || "."
}

export const join = (...parts: string[]) => normalize(parts.join("/"))

export function dirname(p: string): string {
  const i = p.lastIndexOf("/")
  return i <= 0 ? "/" : p.slice(0, i)
}

export const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1)

/* the presence of an extension determines file vs folder */
export const hasExtension = (p: string) => /\.[a-z0-9]+$/i.test(basename(p))

export const isWithin = (parent: string, child: string) =>
  child === parent || child.startsWith(`${parent}/`)

export const relative = (root: string, p: string) =>
  p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p

/* dirs from root (inclusive) down to the file's parent (inclusive) */
export function ancestors(root: string, file: string): string[] {
  const out: string[] = []
  let dir = dirname(file)
  while (isWithin(root, dir)) {
    out.unshift(dir)
    if (dir === root) break
    dir = dirname(dir)
  }
  return out
}
