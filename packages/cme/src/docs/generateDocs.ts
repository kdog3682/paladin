// @paladin/codemirror-editor-experiment/docs/generateDocs.ts

export type SymbolKind = 'function' | 'class' | 'variable' | 'import' | 'type'

export interface SymbolInfo {
  name: string
  kind: SymbolKind
  line: number
}

export interface DocInfo {
  symbols: SymbolInfo[]
  lineCount: number
}

const PATTERNS: Array<{ kind: SymbolKind, re: RegExp }> = [
  { kind: 'import',   re: /^import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/  },
  { kind: 'function', re: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/                     },
  { kind: 'function', re: /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/       },
  { kind: 'function', re: /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\w*\s*=>/ },
  { kind: 'class',    re: /^(?:export\s+)?class\s+(\w+)/                                     },
  { kind: 'type',     re: /^(?:export\s+)?(?:type|interface|enum)\s+(\w+)/                    },
  { kind: 'variable', re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/                     },
  // python-ish
  { kind: 'function', re: /^def\s+(\w+)\s*\(/                                                },
  { kind: 'class',    re: /^class\s+(\w+)[:(]/                                               },
]

export function generateDocs(code: string): DocInfo {
  const lines = code.split('\n')
  const symbols: SymbolInfo[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()

    for (const { kind, re } of PATTERNS) {
      const m = trimmed.match(re)
      if (m) {
        symbols.push({ name: m[1], kind, line: i + 1 })
        break
      }
    }
  }

  return { symbols, lineCount: lines.length }
}
