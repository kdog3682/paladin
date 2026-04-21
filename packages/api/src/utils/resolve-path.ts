export function resolvePath(p: string) {
  return p.startsWith("/") ? p : "./" + p
}
