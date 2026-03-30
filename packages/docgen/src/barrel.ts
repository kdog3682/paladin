// @paladin/docgen/barrel.ts

import { parseFile } from "./parser"
import type { BarrelExport } from "./types"

/**
 * Parse an entrypoint (barrel) file and collect the names it exports
 * along with where they come from.
 *
 * Handles:
 *   export { Foo, Bar } from './foo'
 *   export { Baz as Qux } from './baz'
 *   export * from './utils'           → flagged, requires full parse of source
 *   export function inline() {}       → source = null (defined here)
 *   export type { MyType } from './t' → same treatment as value exports
 */
export function collectBarrelExports(entrypointPath: string): BarrelExport[] {
  const { ast } = parseFile(entrypointPath)
  const exports: BarrelExport[] = []

  for (const item of ast.body) {
    // export { Foo, Bar } from './source'
    // export { Foo, Bar }  (local re-export, no source)
    if (item.type === "ExportNamedDeclaration") {
      const source = item.source?.value ?? null
      for (const spec of item.specifiers ?? []) {
        if (spec.type === "ExportSpecifier") {
          exports.push({
            exportedName: spec.exported?.value ?? spec.orig?.value,
            localName: spec.orig?.value,
            source,
          })
        }
      }

      // inline declaration: export const x = ..., export function y() {}
      if (item.declaration) {
        for (const exp of extractInlineExportNames(item.declaration)) {
          exports.push({ ...exp, source: null })
        }
      }
    }

    // export default ...
    if (item.type === "ExportDefaultDeclaration") {
      const name = item.decl?.identifier?.value ?? "default"
      exports.push({ exportedName: "default", localName: name, source: null })
    }

    // export declaration (export function foo, export class Bar, etc.)
    if (item.type === "ExportDeclaration") {
      for (const exp of extractInlineExportNames(item.declaration)) {
        exports.push({ ...exp, source: null })
      }
    }

    // export * from './utils' — we need to resolve these by parsing the source
    if (item.type === "ExportAllDeclaration") {
      const source = item.source?.value
      if (source) {
        exports.push({ exportedName: "*", localName: "*", source })
      }
    }
  }

  return exports
}

function extractInlineExportNames(decl: any): { exportedName: string, localName: string }[] {
  if (!decl) return []

  switch (decl.type) {
    case "FunctionDeclaration":
      return [{ exportedName: decl.identifier.value, localName: decl.identifier.value }]

    case "ClassDeclaration":
      return [{ exportedName: decl.identifier.value, localName: decl.identifier.value }]

    case "TsTypeAliasDeclaration":
      return [{ exportedName: decl.id.value, localName: decl.id.value }]

    case "TsInterfaceDeclaration":
      return [{ exportedName: decl.id.value, localName: decl.id.value }]

    case "VariableDeclaration":
      return decl.declarations
        .filter((d: any) => d.id?.value)
        .map((d: any) => ({ exportedName: d.id.value, localName: d.id.value }))

    default:
      return []
  }
}
