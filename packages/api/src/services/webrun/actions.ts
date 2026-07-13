import { readFile } from 'node:fs/promises'

export interface DemoAction {
  cmd: string
  desc: string
}

// Pull the `export const ACTIONS = [ ... ]` literal out of a demo file WITHOUT
// importing it — the file may live in a project the runner can't resolve.
export async function extractActions(file: string): Promise<DemoAction[]> {
  const src = await readFile(file, 'utf8')
  const start = src.search(/export\s+const\s+ACTIONS\s*=\s*\[/)
  if (start === -1) return []

  const open = src.indexOf('[', start)
  const literal = sliceBalanced(src, open)
  if (!literal) return []

  // The literal is JS (single quotes, unquoted keys, trailing commas), not JSON,
  // so evaluate it in an isolated function instead of JSON.parse.
  return new Function(`return (${literal})`)() as DemoAction[]
}

// Substring from the opening bracket to its matching close, ignoring brackets
// that live inside string / template literals.
function sliceBalanced(src: string, open: number) {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    const prev = src[i - 1]
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return null
}
