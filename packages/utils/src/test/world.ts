/*
const p = new LoremFiles("/tmp/world")
p.add("src/abc.ts", "export const abc = 1")
p.saveToDisk()
p.path("src/abc.ts") // fullpath
p.removeFromDisk()
*/

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { dedent } from "../text/dedent"

const TMP = "/tmp"

export class LoremFiles {
  readonly root: string

  private files = new Map<string, string>()

  constructor(root: string) {
    this.root = tmpRoot(root)
  }

  add(path: string, content = "") {
    this.files.set(this.key(path), dedent(content))
    return this
  }

  remove(path: string) {
    this.files.delete(this.key(path))
    return this
  }
  path(path: string) {
    return join(this.root, this.key(path))
  }
  
  saveToDisk() {
    this.removeFromDisk()
    for (const [path, content] of this.files) {
      const target = join(this.root, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content, "utf8")
    }
    return this
  }

  removeFromDisk() {
    rmSync(this.root, { recursive: true, force: true })
    return this
  }

  private key(path: string) {
    if (isAbsolute(path)) throw new Error(`LoremFiles paths must be relative, got "${path}"`)
    const rel = relative(this.root, resolve(this.root, path))
    if (rel === "" || rel.startsWith("..")) throw new Error(`LoremFiles path escapes root: "${path}"`)
    return normalize(rel).split(sep).join("/")
  }
}

function tmpRoot(root: string) {
  const abs = isAbsolute(root) ? normalize(root) : resolve(TMP, root)
  const scoped = abs === TMP || abs.startsWith(TMP + sep) ? abs : join(TMP, abs)
  if (scoped === TMP) throw new Error(`LoremFiles root cannot be ${TMP} itself`)
  return scoped
}
