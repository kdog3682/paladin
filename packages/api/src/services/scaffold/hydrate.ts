import { join } from 'path'
import { existsSync } from 'fs'

// fills {{ KEY }} (with or without surrounding spaces) from kwargs.
// unknown keys are left untouched.
function fill(text: string, kwargs: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => (key in kwargs ? kwargs[key] : whole))
}

// splits a template into { path, content } blocks.
// block shape:
//   ===
//   <relative path>
//   ===
//   <content...>
function parseTemplate(text: string): { path: string; content: string }[] {
  const lines = text.split('\n')
  const files: { path: string; content: string }[] = []
  let i = 0

  while (i < lines.length) {
    if (/^={3,}$/.test(lines[i].trim())) {
      const path = lines[i + 1]?.trim()
      i += 3 // skip ===, path, ===
      const buf: string[] = []
      while (i < lines.length && !/^={3,}$/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      if (path) files.push({ path, content: buf.join('\n').replace(/^\n+|\n+$/g, '') })
    } else {
      i++
    }
  }

  return files
}

// reads templatePath, hydrates each block, and writes the files under baseDir.
// existing files (e.g. a package.json the user already presented) are never
// overwritten. returns the absolute paths written.
export async function hydrate(
  templatePath: string,
  baseDir: string,
  kwargs: Record<string, string>,
): Promise<string[]> {
  const text = await Bun.file(templatePath).text()
  const files = parseTemplate(text)
  const written: string[] = []

  for (const file of files) {
    const out = join(baseDir, fill(file.path, kwargs))
    if (existsSync(out)) continue
    await Bun.write(out, fill(file.content, kwargs))
    written.push(out)
  }

  return written
}
