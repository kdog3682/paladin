// @paladin/docgen/extractor.ts

import { extractDocComment } from "./parser"
import { resolveType, buildTypeRegistry } from "./type-resolver"
import type {
  ExportedSymbol,
  FunctionDoc,
  ClassDoc,
  TypeDoc,
  ConstDoc,
  MethodDoc,
  ParamDoc,
  TypeRegistry,
} from "./types"

/**
 * Extract only the symbols matching `allowedNames` from a parsed file.
 * If allowedNames is null, extract everything that's exported (expandAll mode).
 */
export function extractExports(
  ast: any,
  source: string,
  allowedNames: Set<string> | null
): ExportedSymbol[] {
  const registry = buildTypeRegistry(ast, source)
  const symbols: ExportedSymbol[] = []

  for (const item of ast.body) {
    const extracted = extractFromNode(item, source, registry)
    for (const sym of extracted) {
      if (allowedNames === null || allowedNames.has(sym.name)) {
        symbols.push(sym)
      }
    }
  }

  return symbols
}

/**
 * Collect every exported name from a module AST.
 * Used to resolve `export * from '...'` — we parse the target
 * and grab all its export names.
 */
export function collectAllExportedNames(ast: any): string[] {
  const names: string[] = []

  for (const item of ast.body) {
    if (item.type === "ExportDeclaration" && item.declaration) {
      names.push(...getDeclNames(item.declaration))
    }
    if (item.type === "ExportDefaultDeclaration") {
      names.push(item.decl?.identifier?.value ?? "default")
    }
    if (item.type === "ExportNamedDeclaration") {
      for (const spec of item.specifiers ?? []) {
        if (spec.type === "ExportSpecifier") {
          names.push(spec.exported?.value ?? spec.orig?.value)
        }
      }
      if (item.declaration) {
        names.push(...getDeclNames(item.declaration))
      }
    }
  }

  return names
}

function getDeclNames(decl: any): string[] {
  if (!decl) return []
  switch (decl.type) {
    case "FunctionDeclaration": return [decl.identifier?.value].filter(Boolean)
    case "ClassDeclaration": return [decl.identifier?.value].filter(Boolean)
    case "TsTypeAliasDeclaration": return [decl.id?.value].filter(Boolean)
    case "TsInterfaceDeclaration": return [decl.id?.value].filter(Boolean)
    case "VariableDeclaration":
      return decl.declarations.map((d: any) => d.id?.value).filter(Boolean)
    default: return []
  }
}

// --- internal extraction logic ---

function extractFromNode(item: any, source: string, registry: TypeRegistry): ExportedSymbol[] {
  const results: ExportedSymbol[] = []

  if (item.type === "ExportDeclaration" && item.declaration) {
    const syms = extractDeclaration(item.declaration, source, registry)
    if (syms) results.push(...syms)
  }

  if (item.type === "ExportDefaultDeclaration") {
    const syms = extractDeclaration(item.decl, source, registry)
    if (syms) {
      for (const s of syms) s.name = s.name || "default"
      results.push(...syms)
    }
  }

  // Non-reexport named: export { x } (no source) — find local decl
  if (item.type === "ExportNamedDeclaration" && !item.source) {
    if (item.declaration) {
      const syms = extractDeclaration(item.declaration, source, registry)
      if (syms) results.push(...syms)
    }
  }

  // Top-level declarations (not exported directly but may be referenced via barrel)
  if (
    item.type === "FunctionDeclaration" ||
    item.type === "ClassDeclaration" ||
    item.type === "TsTypeAliasDeclaration" ||
    item.type === "TsInterfaceDeclaration" ||
    item.type === "VariableDeclaration"
  ) {
    const syms = extractDeclaration(item, source, registry)
    if (syms) results.push(...syms)
  }

  return results
}

function extractDeclaration(
  decl: any,
  source: string,
  registry: TypeRegistry
): ExportedSymbol[] | null {
  if (!decl) return null

  switch (decl.type) {
    case "FunctionDeclaration":
      return [extractFunction(decl, source, registry)]

    case "ClassDeclaration":
      return [extractClass(decl, source, registry)]

    case "TsTypeAliasDeclaration":
      return [extractTypeAlias(decl, source, registry)]

    case "TsInterfaceDeclaration":
      return [extractInterface(decl, source, registry)]

    case "VariableDeclaration":
      return decl.declarations.map((d: any) => extractConst(d, source, registry)).filter(Boolean)

    default:
      return null
  }
}

function extractFunction(node: any, source: string, registry: TypeRegistry): FunctionDoc {
  const name = node.identifier?.value ?? "anonymous"
  const description = extractDocComment(source, node.span.start)
  const params = extractParams(node.params, source, registry)
  const returnType = node.returnType?.typeAnnotation
    ? resolveType(node.returnType.typeAnnotation, registry)
    : null

  const paramStr = params
    .map(p => {
      const opt = p.optional ? "?" : ""
      const def = p.defaultValue ? ` = ${p.defaultValue}` : ""
      const type = p.type ? `: ${p.type}` : ""
      return `${p.name}${opt}${type}${def}`
    })
    .join(", ")

  const asyncPrefix = node.async ? "async " : ""
  const genStar = node.generator ? "*" : ""
  const retStr = returnType ? ` → ${returnType}` : ""
  const signature = `${asyncPrefix}function ${genStar}${name}(${paramStr})${retStr}`

  return {
    kind: "function",
    name,
    description,
    signature,
    isAsync: !!node.async,
    isGenerator: !!node.generator,
    params,
    returnType,
  }
}

function extractClass(node: any, source: string, registry: TypeRegistry): ClassDoc {
  const name = node.identifier?.value ?? "anonymous"
  const description = extractDocComment(source, node.span.start)
  const methods: MethodDoc[] = []
  const properties: import("./types").PropertyDoc[] = []

  for (const member of node.body ?? []) {
    if (member.type === "ClassMethod") {
      const visibility = getVisibility(member.accessibility)
      if (visibility === "private") continue

      const mName = member.key?.value ?? "unknown"
      const mDesc = extractDocComment(source, member.span.start)
      const params = extractParams(member.function.params, source, registry)
      const returnType = member.function.returnType?.typeAnnotation
        ? resolveType(member.function.returnType.typeAnnotation, registry)
        : null

      const paramStr = params
        .map(p => {
          const opt = p.optional ? "?" : ""
          const type = p.type ? `: ${p.type}` : ""
          return `${p.name}${opt}${type}`
        })
        .join(", ")

      const asyncPrefix = member.function.async ? "async " : ""
      const staticPrefix = member.isStatic ? "static " : ""
      const retStr = returnType ? ` → ${returnType}` : ""
      const signature = `${staticPrefix}${asyncPrefix}${mName}(${paramStr})${retStr}`

      methods.push({
        name: mName,
        description: mDesc,
        signature,
        visibility,
        isAsync: !!member.function.async,
        isStatic: !!member.isStatic,
        params,
        returnType,
      })
    }

    if (member.type === "ClassProperty") {
      const visibility = getVisibility(member.accessibility)
      if (visibility === "private") continue

      properties.push({
        name: member.key?.value ?? "unknown",
        type: member.typeAnnotation?.typeAnnotation
          ? resolveType(member.typeAnnotation.typeAnnotation, registry)
          : null,
        visibility,
        isStatic: !!member.isStatic,
        isReadonly: !!member.readonly,
      })
    }
  }

  return { kind: "class", name, description, methods, properties }
}

function extractTypeAlias(node: any, source: string, registry: TypeRegistry): TypeDoc {
  const name = node.id.value
  const description = extractDocComment(source, node.span.start)
  const visited = new Set<string>([name])
  const expanded = resolveType(node.typeAnnotation, registry, visited)

  return { kind: "type", name, description, expanded }
}

function extractInterface(node: any, source: string, registry: TypeRegistry): TypeDoc {
  const name = node.id.value
  const description = extractDocComment(source, node.span.start)
  const visited = new Set<string>([name])

  const members = node.body?.body ?? []
  if (members.length === 0) {
    return { kind: "type", name, description, expanded: "{}" }
  }

  const lines = members.map((m: any) => {
    if (m.type === "TsPropertySignature") {
      const key = m.key?.value ?? "unknown"
      const opt = m.optional ? "?" : ""
      const type = resolveType(m.typeAnnotation?.typeAnnotation, registry, visited, 1)
      return `  ${key}${opt}: ${type}`
    }
    if (m.type === "TsMethodSignature") {
      const key = m.key?.value ?? "unknown"
      const params = m.params
        ?.map((p: any) => {
          const pName = p.pat?.value ?? "_"
          const pType = resolveType(p.typeAnnotation?.typeAnnotation, registry, visited, 1)
          return `${pName}: ${pType}`
        })
        .join(", ")
      const ret = resolveType(m.typeAnn?.typeAnnotation, registry, visited, 1)
      return `  ${key}(${params}): ${ret}`
    }
    return "  unknown"
  })

  return { kind: "type", name, description, expanded: `{\n${lines.join("\n")}\n}` }
}

function extractConst(node: any, source: string, registry: TypeRegistry): ConstDoc | null {
  const name = node.id?.value ?? node.id?.properties?.[0]?.value?.value
  if (!name) return null

  const description = extractDocComment(source, node.span.start)
  const type = node.id?.typeAnnotation?.typeAnnotation
    ? resolveType(node.id.typeAnnotation.typeAnnotation, registry)
    : null

  return { kind: "const", name, description, type }
}

function extractParams(params: any[], source: string, registry: TypeRegistry): ParamDoc[] {
  if (!params) return []

  return params.map(p => {
    const pat = p.pat ?? p
    let name = "unknown"
    let optional = false
    let defaultValue: string | null = null
    let typeNode = null

    if (pat.type === "AssignmentPattern") {
      name = pat.left?.value ?? pat.left?.properties?.[0]?.key?.value ?? "unknown"
      optional = true
      defaultValue = source.slice(pat.right.span.start, pat.right.span.end)
      typeNode = pat.left?.typeAnnotation?.typeAnnotation
    } else if (pat.type === "Identifier") {
      name = pat.value
      optional = !!pat.optional
      typeNode = pat.typeAnnotation?.typeAnnotation
    } else if (pat.type === "RestElement") {
      name = `...${pat.argument?.value ?? "rest"}`
      typeNode = pat.typeAnnotation?.typeAnnotation
    }

    if (!typeNode && p.typeAnnotation?.typeAnnotation) {
      typeNode = p.typeAnnotation.typeAnnotation
    }

    const type = typeNode ? resolveType(typeNode, registry) : null
    return { name, type, optional, defaultValue }
  })
}

function getVisibility(accessibility: string | null | undefined): "public" | "protected" | "private" {
  if (accessibility === "protected") return "protected"
  if (accessibility === "private") return "private"
  return "public"
}
