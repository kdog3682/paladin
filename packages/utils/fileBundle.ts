export interface BundledFile {
  path: string
  content: string
}

const DELIMITER = '==='

function fill(text: string, kwargs: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) => (key in kwargs ? kwargs[key] : whole))
}

// Packs an array of { path, content } files into a single string.
// Each file is separated by === delimiters with the path on the line between them.
export function bundle(files: BundledFile[]): string {
  return files
    .map(({ path, content }) => `${DELIMITER}\n${path}\n${DELIMITER}\n${content}`)
    .join('\n\n')
}

// Parses a multi-file string into { path, content } files. Each file block looks like:
//   ===
//   src/foo.ts
//   ===
//   <file content>
// Pass kwargs to substitute {{ KEY }} placeholders in both paths and content.
export function unbundle(text: string, kwargs?: Record<string, string>): BundledFile[] {
  const lines = text.split('\n')
  const files: BundledFile[] = []
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
      if (path) {
        const content = buf.join('\n').replace(/^\n+|\n+$/g, '')
        files.push(kwargs
          ? { path: fill(path, kwargs), content: fill(content, kwargs) }
          : { path, content })
      }
    } else {
      i++
    }
  }

  return files
}
