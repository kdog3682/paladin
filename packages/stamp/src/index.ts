// @paladin/stamp/index.ts

import { mkdirSync, writeFileSync, readFileSync } from "fs"
import { dirname, join, relative } from "path"
import { homedir } from "os"

const BASE_DIR = join(homedir(), ".paladin", "tmp")

interface ParsedFile {
  relPath: string
  content: string
}

function parse(template: string): ParsedFile[] {
  const blocks = template.split(/^={3,}\s*$/m)
  const files: ParsedFile[] = []

  // drop everything before the first === delimiter
  blocks.shift()

  for (let i = 0; i < blocks.length - 1; i += 2) {
    files.push({
      relPath: blocks[i].trim(),
      content: blocks[i + 1].trim(),
    })
  }

  return files
}



export { stamp, toStamp }

/**
 * Reads a list of files and produces a `===`-delimited template string.
 * Paths are made relative to `root`.
 *
 * @example
 * const template = toStamp([
 *   "/home/user/.paladin/tmp/config.json",
 *   "/home/user/.paladin/tmp/src/index.ts",
 * ])
 * // => "===\nconfig.json\n===\n{ \"port\": 3000 }\n===\nsrc/index.ts\n===\nconsole.log(\"hello\")\n"
 */
function toStamp(files: string[], root = BASE_DIR): string {
  return files
    .map(absPath => {
      const rel = relative(root, absPath)
      const relPath = rel.startsWith("..") ? absPath : rel
      const content = readFileSync(absPath, "utf-8")
      return `===\n${relPath}\n===\n${content}`
    })
    .join("\n")
}

/**
 * Parses a `===`-delimited template into file path / content pairs
 * and writes them to disk. Returns an array of absolute paths.
 *
 * - Content before the first `===` is ignored
 * - Delimiters can be 3+ `=` characters
 * - Directories are created automatically
 * - Non-string content is coerced to a string
 *
 * @example
 * const paths = stamp(`
 * ===
 * config.json
 * ===
 * { "port": 3000 }
 * ===
 * src/index.ts
 * ===
 * console.log("hello")
 * `)
 * // => ["~/.paladin/tmp/config.json", "~/.paladin/tmp/src/index.ts"]
 */
function stamp(template: string, root = BASE_DIR): string[] {
  const parsed = parse(template)
  const absolutePaths: string[] = []

  for (const { relPath, content } of parsed) {
    const absPath = relPath.startsWith("/") ? relPath : join(root, relPath)
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, content, "utf-8")
    absolutePaths.push(absPath)
  }

  return absolutePaths
}
