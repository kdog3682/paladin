// Transitive local-import closure + cache-key derivation. Lazy: hashes only the
// files reachable from an entry, on first request, memoized per resolver
// instance. No upfront directory scan — the walk visits exactly the files that
// can affect a run, and no more.

import { hashContent } from './hash'
import { extractSpecifiers, resolveLocal } from './imports'

export class ClosureResolver {
  private readonly memo = new Map<string, string>() // path -> contentHash

  // externalKey: a stable digest of the project's resolved external deps
  // (sorted "name@version"). Moves when a dep version changes — that's what
  // invalidates cached runs on install/upgrade, since node_modules is never
  // hashed and never in the local closure.
  constructor(
    private readonly base: string,
    private readonly externalKey: string,
  ) {}

  // Cache key: hash of the transitive local closure plus the external-dep key.
  // A deep edit in any imported local file moves it via the closure; a dep bump
  // moves it via externalKey.
  async cacheKey(entryPath: string): Promise<string> {
    const closure = await this.walk(entryPath)
    const parts = [...closure.values()].sort().join('|')
    return hashContent(`${parts}::${this.externalKey}`)
  }

  // The set of local files reachable from entry (entry included). Used by the
  // watcher to map a changed source back to the runnables that depend on it.
  async closurePaths(entryPath: string): Promise<Set<string>> {
    return new Set((await this.walk(entryPath)).keys())
  }

  // Drops a path's memoized hash so the next walk re-reads it. Call on file
  // change when reusing a resolver across watch ticks.
  invalidate(path: string): void {
    this.memo.delete(path)
  }

  // BFS over local imports, collecting each reachable file's path + contentHash.
  // Reads each file once. Missing files are skipped, not folded in — a broken
  // import shouldn't pin a key to a phantom.
  private async walk(entryPath: string): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const queue = [entryPath]

    while (queue.length) {
      const path = queue.shift()!
      if (out.has(path)) continue

      const file = Bun.file(path)
      if (!(await file.exists())) continue
      const content = await file.text()

      const hash = this.memo.get(path) ?? hashContent(content)
      this.memo.set(path, hash)
      out.set(path, hash)

      for (const spec of await extractSpecifiers(content)) {
        const local = resolveLocal(spec, path, this.base)
        if (local && !out.has(local)) queue.push(local)
      }
    }

    return out
  }
}
