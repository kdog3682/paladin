import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"
import type { MochiCall, MochiFile, MochiSection, MochiStory } from "./types"

const parser = new Parser()
parser.setLanguage(TypeScript.typescript)

function getText(node: Parser.SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex)
}

function getInlineComment(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (child.isExtra && child.type === "comment" && !child.text.startsWith("/*")) {
      return child.text.replace(/^\/\/\s*/, "").trim()
    }
  }
  return null
}

function getDeclaredVars(node: Parser.SyntaxNode, source: string): string[] {
  if (node.type !== "lexical_declaration") return []
  const vars: string[] = []
  for (const child of node.namedChildren) {
    if (child.type === "variable_declarator") {
      const name = child.childForFieldName("name")
      if (name) vars.push(getText(name, source))
    }
  }
  return vars
}

function usesVars(node: Parser.SyntaxNode, source: string, vars: Set<string>): boolean {
  if (!vars.size) return false
  const text = getText(node, source)
  for (const v of vars) {
    if (new RegExp(`\\b${v}\\b`).test(text)) return true
  }
  return false
}

function hasBlankLineBefore(node: Parser.SyntaxNode, prev: Parser.SyntaxNode | null): boolean {
  if (!prev) return false
  return node.startPosition.row > prev.endPosition.row + 1
}

function parseDivider(text: string): { isSectionMarker: true; title: string | null } | null {
  const t = text.trim()
  if (/^[=\-]{3,}$/.test(t)) return { isSectionMarker: true, title: null }
  const m = t.match(/^[=\-]{2,}\s+(.+?)\s+[=\-]{2,}$/)
  if (m) return { isSectionMarker: true, title: m[1].trim() }
  return null
}

function extractBlockTitle(raw: string): string | null {
  return raw.replace(/^\/\*+\s*/, "").replace(/\s*\*+\/$/, "").trim() || null
}

// Strips console.log() wrapper if present
function unwrapConsoleLog(source: string): { inner: string; isLog: boolean } {
  const s = source.replace(/;$/, "").trim()
  const prefix = "console.log("
  if (s.startsWith(prefix) && s.endsWith(")")) {
    return { inner: s.slice(prefix.length, -1), isLog: true }
  }
  return { inner: s, isLog: false }
}

function buildCall(node: Parser.SyntaxNode, source: string): MochiCall {
  const note = getInlineComment(node)
  let raw = getText(node, source)
  if (note !== null) raw = raw.replace(/\s*\/\/.*$/, "").trimEnd()
  const { inner, isLog } = unwrapConsoleLog(raw)
  return { source: inner, note, isLog }
}

export function parseMochiFile(source: string, filePath: string): MochiFile {
  const root = parser.parse(source).rootNode
  const children = root.children.filter(
    n => n.type === "comment" || n.type === "expression_statement" || n.type === "lexical_declaration"
  )

  const sections: MochiSection[] = []
  let currentSection: MochiSection = { title: null, stories: [] }
  let currentStory: MochiStory | null = null
  let currentVars = new Set<string>()
  let pendingLines: string[] = []
  let prev: Parser.SyntaxNode | null = null

  function flushStory() {
    if (currentStory && (currentStory.calls.length > 0 || currentStory.context.length > 0)) {
      currentSection.stories.push(currentStory)
    }
    currentStory = null
    currentVars = new Set()
  }

  function flushSection() {
    flushStory()
    if (currentSection.stories.length > 0 || currentSection.title !== null) {
      sections.push(currentSection)
    }
  }

  function startStory() {
    currentStory = {
      description: pendingLines.length > 0 ? pendingLines.join("\n") : null,
      context: [],
      calls: [],
    }
    pendingLines = []
    currentVars = new Set()
  }

  for (let i = 0; i < children.length; i++) {
    const node = children[i]

    if (node.type === "comment") {
      const raw = node.text

      if (raw.startsWith("/*")) {
        flushSection()
        currentSection = { title: extractBlockTitle(raw), stories: [] }
        pendingLines = []
        prev = node
        continue
      }

      const content = raw.replace(/^\/\/\s*/, "").trim()
      const divider = parseDivider(content)

      if (divider) {
        if (divider.title) {
          flushSection()
          currentSection = { title: divider.title, stories: [] }
          pendingLines = []
        } else {
          const next = children[i + 1]
          const after = children[i + 2]
          if (
            next?.type === "comment" &&
            !next.text.startsWith("/*") &&
            after?.type === "comment" &&
            !after.text.startsWith("/*") &&
            parseDivider(after.text.replace(/^\/\/\s*/, "").trim())
          ) {
            const title = next.text.replace(/^\/\/\s*/, "").trim()
            flushSection()
            currentSection = { title, stories: [] }
            pendingLines = []
            i += 2
          } else {
            flushSection()
            currentSection = { title: null, stories: [] }
            pendingLines = []
          }
        }
        prev = node
        continue
      }

      if (hasBlankLineBefore(node, prev)) flushStory()
      pendingLines.push(content)
      prev = node
      continue
    }

    const blank = hasBlankLineBefore(node, prev)
    const deps = usesVars(node, source, currentVars)

    if (currentStory && blank && !deps) flushStory()
    if (!currentStory) startStory()

    if (node.type === "lexical_declaration") {
      const raw = getText(node, source).replace(/;$/, "").trim()
      currentStory!.context.push(raw)
      for (const v of getDeclaredVars(node, source)) currentVars.add(v)
    } else {
      currentStory!.calls.push(buildCall(node, source))
    }

    prev = node
  }

  flushSection()
  return { path: filePath, sections }
}

export function extractImports(source: string): string {
  const root = parser.parse(source).rootNode
  return root.children
    .filter(n => n.type === "import_statement")
    .map(n => n.text)
    .join("\n")
}
