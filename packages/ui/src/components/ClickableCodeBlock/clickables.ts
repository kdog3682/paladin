import type { ThemedToken } from 'shiki'

export interface Clickable {
  kind: 'symbol' | 'source'
  value: string
  source: string
}

export function findClickables(tokens: ThemedToken[]): Map<number, Clickable> {
  const out = new Map<number, Clickable>()
  const text = tokens.map((t) => t.content)

  if (!text.some((t) => t === 'import' || t === 'export')) return out

  const fromIdx = text.indexOf('from')
  let srcIdx = -1
  if (fromIdx !== -1) {
    for (let i = fromIdx + 1; i < tokens.length; i++) {
      if (isStringToken(tokens[i])) {
        srcIdx = i
        break
      }
    }
  } else {
    srcIdx = tokens.findIndex(isStringToken)
  }
  if (srcIdx === -1) return out

  const source = stripQuotes(text[srcIdx])
  out.set(srcIdx, { kind: 'source', value: source, source })

  const skip = new Set(['import', 'export', 'type', 'as', 'default', 'from', '*', ',', '{', '}'])
  const stop = fromIdx === -1 ? srcIdx : fromIdx
  for (let i = 0; i < stop; i++) {
    const tok = tokens[i]
    if (skip.has(tok.content.trim())) continue
    if (isIdentifier(tok)) out.set(i, { kind: 'symbol', value: tok.content, source })
  }

  return out
}

function isStringToken(tok: ThemedToken) {
  const t = tok.content.trim()
  return t.length >= 2 && (t.startsWith("'") || t.startsWith('"')) && (t.endsWith("'") || t.endsWith('"'))
}

function stripQuotes(s: string) {
  return s.trim().slice(1, -1)
}

function isIdentifier(tok: ThemedToken) {
  return /^[A-Za-z_$][\w$]*$/.test(tok.content.trim())
}
