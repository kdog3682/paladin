// @paladin/stamp/stamp.mochi.ts

import { stamp, toStamp } from "@paladin/stamp"
import { join } from "path"
import { homedir } from "os"

const BASE_DIR = join(homedir(), ".paladin", "tmp")

/* stamp files from a template string */
export function stampBasic() {
  const paths = stamp(`
some preamble, ignored
===
config.json
===
{ "port": 3000 }
===
src/index.ts
===
console.log("hello")
`)

  return paths
  // => ["~/.paladin/tmp/config.json", "~/.paladin/tmp/src/index.ts"]
}

/* stamp with a custom root directory */
export function stampCustomRoot() {
  const paths = stamp(`
===
setup.yml
===
name: test
debug: true
`, "/tmp/my-test")

  return paths
  // => ["/tmp/my-test/setup.yml"]
}

/* stamp handles absolute paths without joining to root */
export function stampAbsolutePath() {
  const absFile = join(homedir(), ".paladin", "tmp-abs", "ABC.txt")
  const paths = stamp(`
===
${absFile}
===
hello world
===
relative.txt
===
this goes under root
`)

  return paths
  // => ["~/.paladin/tmp-abs/ABC.txt", "~/.paladin/tmp/relative.txt"]
}

/* generate a stamp template from existing files */
export function toStampBasic() {
  const files = [
    join(BASE_DIR, "config.json"),
    join(BASE_DIR, "src/index.ts"),
  ]

  const template = toStamp(files)

  return template
  // => "===\nconfig.json\n===\n...\n===\nsrc/index.ts\n===\n..."
}

/* toStamp keeps absolute paths for files outside root */
export function toStampOutsideRoot() {
  const files = [
    join(BASE_DIR, "config.json"),
    join(homedir(), ".paladin", "tmp-abs", "ABC.txt"),
  ]

  const template = toStamp(files)

  return template
  // config.json stays relative, ABC.txt keeps its absolute path
}

/* roundtrip: stamp → toStamp → stamp */
export function roundtrip() {
  const original = `
===
data.json
===
{ "ok": true }
===
readme.md
===
# Hello
`

  const paths = stamp(original)
  const regenerated = toStamp(paths)
  const paths2 = stamp(regenerated)

  return { paths, paths2 }
  // paths and paths2 should match
}
