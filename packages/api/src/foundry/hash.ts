// Content hashing for change detection and cache keys — backend-only, never
// displayed. Content, not mtime: identical rewrites and edit-and-revert must
// read as unchanged, and the digest is portable across filesystems/clocks.

const digest = (content: string): string =>
  new Bun.CryptoHasher('sha256').update(content).digest('hex').slice(0, 16)

// Stable 64-bit hex digest of a string.
export function hashContent(content: string): string {
  return digest(content)
}

// Hashes a file's bytes from disk. Returns null if the file is missing so
// callers can skip it rather than poison a cache key.
export async function hashFile(path: string): Promise<string | null> {
  const file = Bun.file(path)
  if (!(await file.exists())) return null
  return digest(await file.text())
}
