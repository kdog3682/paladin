// src/services/ticket/helpers.ts

import { basename } from 'path'
import type { TicketFile } from '../../types'
import * as fs from '../fs'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'this', 'that',
  'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'about', 'up', 'also', 'like', 'use',
  'make', 'get', 'set', 'add', 'new', 'file', 'data', 'type', 'import',
  'export', 'function', 'return', 'const', 'let', 'var',
])

/**
 * split "fooBarBaz" -> ["foo", "bar", "baz"]
 * split "foo-bar-baz" -> ["foo", "bar", "baz"]
 * split "FooBar" -> ["foo", "bar"]
 */
export function splitIdentifier(name: string): string[] {
  const withoutExt = name.replace(/\.[^.]+$/, '')
  return withoutExt
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_./]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

export function extractWordsFromNotes(notes: string[]): string[] {
  return notes
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

export function determineKeywords(files: TicketFile[]): string[] {
  const freq = new Map<string, number>()

  for (const file of files) {
    const atoms = splitIdentifier(basename(file.path))
    for (const atom of atoms) {
      if (!STOPWORDS.has(atom)) {
        freq.set(atom, (freq.get(atom) ?? 0) + 2)
      }
    }

    const noteWords = extractWordsFromNotes(file.notes)
    for (const word of noteWords) {
      freq.set(word, (freq.get(word) ?? 0) + 1)
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word)
}

export function stubName(keywords: string[]): string {
  return keywords.join('-') || 'untitled'
}

/**
 * builds the export payload:
 *
 * ---
 * files:
 *   - <path>
 * prompts:
 *   - <prompt name>
 *
 * overview:
 *
 * ---
 *
 * ## <path>
 *   - note
 *   - note
 */
export async function buildExportPayload(
  files: TicketFile[],
  promptDir?: string,
): Promise<string> {
  const matchingPrompts = promptDir
    ? await findMatchingPrompts(promptDir, files.map((f) => f.path))
    : []

  const lines: string[] = []

  // frontmatter
  lines.push('---')
  lines.push('files:')
  for (const f of files) {
    lines.push(`  - ${f.path}`)
  }
  if (matchingPrompts.length) {
    lines.push('prompts:')
    for (const p of matchingPrompts) {
      lines.push(`  - ${p.name}`)
    }
  }
  lines.push('')
  lines.push('overview:')
  lines.push('')
  lines.push('---')
  lines.push('')

  // per-file notes
  for (const f of files) {
    lines.push(`## ${f.path}`)
    for (const note of f.notes) {
      const noteLines = note.split('\n')
      lines.push(`  - ${noteLines[0]}`)
      for (const cont of noteLines.slice(1)) {
        lines.push(`    ${cont}`)
      }
    }
    lines.push('')
  }

  // injected instructions
  for (const p of matchingPrompts) {
    lines.push('<instructions>')
    lines.push(p.content)
    lines.push('</instructions>')
    lines.push('')
  }

  return lines.join('\n')
}

type ParsedPrompt = {
  name: string
  matches: string
  content: string
}

export function parsePromptFile(text: string): ParsedPrompt | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return null

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) {
      meta[key.trim()] = rest.join(':').trim()
    }
  }

  if (!meta.name || !meta.matches) return null

  return {
    name: meta.name,
    matches: meta.matches,
    content: match[2].trim(),
  }
}

async function findMatchingPrompts(
  promptDir: string,
  filePaths: string[],
): Promise<ParsedPrompt[]> {
  const promptFiles = await fs.list(promptDir, { glob: '*.prompt.txt' })
  const results: ParsedPrompt[] = []

  for (const pf of promptFiles) {
    const text = await fs.read(pf)
    const parsed = parsePromptFile(text)
    if (!parsed) continue

    const glob = new Bun.Glob(parsed.matches)
    const hasMatch = filePaths.some((fp) => glob.match(basename(fp)))
    if (hasMatch) {
      results.push(parsed)
    }
  }

  return results
}
