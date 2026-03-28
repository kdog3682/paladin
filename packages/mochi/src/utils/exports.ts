// @paladin/mochi/src/utils/exports.ts

import type { Node } from "acorn"

export interface ExportedFn {
  name: string
  node: Node
  bodyNode: Node
}

/**
 * Walks top-level statements and extracts exported functions.
 * Handles both:
 *   export function foo() { ... }
 *   export default function() { ... }  (skipped — mochi doesn't use default exports)
 */
export function extractExportedFunctions(ast: Node): ExportedFn[] {
  const fns: ExportedFn[] = []
  const body = (ast as any).body as Node[]

  for (const stmt of body) {
    if (stmt.type === "ExportNamedDeclaration") {
      const decl = (stmt as any).declaration
      if (!decl) continue

      if (decl.type === "FunctionDeclaration" && decl.id) {
        fns.push({
          name: decl.id.name,
          node: stmt,
          bodyNode: decl.body,
        })
      }
    }
  }

  return fns
}

export interface TopLevelVar {
  name: string
  node: Node
}

/**
 * Extracts non-exported top-level variable declarations.
 * These become shared globals in the suite.
 */
export function extractTopLevelVars(ast: Node): TopLevelVar[] {
  const vars: TopLevelVar[] = []
  const body = (ast as any).body as Node[]

  for (const stmt of body) {
    if (stmt.type === "VariableDeclaration") {
      for (const declarator of (stmt as any).declarations) {
        if (declarator.id?.name) {
          vars.push({ name: declarator.id.name, node: stmt })
        }
      }
    }
  }

  return vars
}
