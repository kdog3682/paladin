#!/usr/bin/env bun

import { relative } from "node:path"
import { createProject, extractSymbols, type ExtractItem } from "@paladin/codemod"
import { type Spec, runArgv } from "@paladin/utils"
import { DEFAULT_PROJECTS, expandHome, finder, type FinderHit } from "./finder"

/**
 * Resolves the backticked names in a snippet (via `finder`) and prints the actual source of
 * each one, so a snippet like "bring in `inoremap` to packages/codemirror" turns into the real
 * declarations instead of a location to go look up by hand.
 */
export async function findSymbols(snippet: string): Promise<string> {
  const projects = DEFAULT_PROJECTS.map(expandHome)
  const { hits } = await finder(snippet, { projects })

  const byRoot = new Map<string, Map<string, ExtractItem>>()
  const notes: string[] = []

  for (const hit of hits) {
    const symbol = symbolToExtract(hit)
    if (!symbol) {
      notes.push(noteFor(hit))
      continue
    }

    const root = projects.find(p => hit.file!.startsWith(`${p}/`))
    if (!root) {
      notes.push(`// ${hit.name}: ${hit.file} is outside the searched projects`)
      continue
    }

    const items = byRoot.get(root) ?? new Map()
    byRoot.set(root, items)

    const file = relative(root, hit.file!)
    const item = items.get(file) ?? { file, symbols: [] }
    items.set(file, item)
    if (!item.symbols.includes(symbol)) item.symbols.push(symbol)
  }

  const chunks: string[] = []
  for (const [root, items] of byRoot) {
    const list = [...items.values()]
    const project = createProject(root, list.map(item => item.file), { noResolve: true })
    chunks.push(extractSymbols(project, list, { root }))
  }
  if (notes.length) chunks.push(notes.join("\n"))

  return chunks.join("\n")
}

/** the module-scope name to hand `extractSymbols`, or undefined when the hit has none */
function symbolToExtract(hit: FinderHit): string | undefined {
  if (!hit.file) return undefined
  return hit.kind === "field" ? hit.via : hit.name
}

function noteFor(hit: FinderHit): string {
  if (hit.kind === "missing") return `// ${hit.name}: not found`
  return `// ${hit.name}: inline field in ${hit.fieldFile}:${hit.line} (no standalone symbol to extract)`
}

if (import.meta.main) {
  const spec = {
    bin: "finder",
    intro: "resolve backticked `name` references in a snippet and print their real source",
    args: [{ name: "snippet", help: "text containing `name` references and packages/<pkg> paths" }],
  } as const satisfies Spec
  runArgv(spec, process.argv.slice(2), ({ args }) => findSymbols(args.snippet)).then((code) => {
    process.exitCode = code
  })
}
