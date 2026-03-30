// @paladin/docgen/type-resolver.ts

import type { TypeRegistry } from "./types"

/**
 * Build a registry of all type/interface declarations in a module AST.
 * Maps type name → AST node for later expansion.
 */
export function buildTypeRegistry(ast: any, source: string): TypeRegistry {
  const registry: TypeRegistry = {}

  for (const item of ast.body) {
    // top-level type alias or interface
    if (item.type === "TsTypeAliasDeclaration") {
      registry[item.id.value] = { node: item, source }
    } else if (item.type === "TsInterfaceDeclaration") {
      registry[item.id.value] = { node: item, source }
    }

    // exported type alias or interface
    if (item.type === "ExportDeclaration" && item.declaration) {
      const decl = item.declaration
      if (decl.type === "TsTypeAliasDeclaration") {
        registry[decl.id.value] = { node: decl, source }
      } else if (decl.type === "TsInterfaceDeclaration") {
        registry[decl.id.value] = { node: decl, source }
      }
    }
  }

  return registry
}

/**
 * Resolve a type AST node into an expanded string representation.
 * Recursively expands type references found in the registry.
 */
export function resolveType(
  node: any,
  registry: TypeRegistry,
  visited: Set<string> = new Set(),
  depth: number = 0
): string {
  if (!node) return "unknown"
  if (depth > 10) return "..."

  const indent = (level: number) => "  ".repeat(level)

  switch (node.type) {
    case "TsKeywordType":
      return node.kind

    case "TsTypeReference": {
      const name = node.typeName?.value ?? resolveEntityName(node.typeName)
      const typeArgs = node.typeParams?.params
        ?.map((p: any) => resolveType(p, registry, visited, depth))
        .join(", ")
      const base = typeArgs ? `${name}<${typeArgs}>` : name

      // expand if in registry and not yet visited (cycle guard)
      if (registry[name] && !visited.has(name)) {
        visited.add(name)
        const expanded = expandRegisteredType(registry[name].node, registry, visited, depth)
        visited.delete(name)
        return expanded
      }

      return base
    }

    case "TsArrayType":
      return `${resolveType(node.elemType, registry, visited, depth)}[]`

    case "TsTupleType": {
      const elems = node.elemTypes
        ?.map((e: any) => resolveType(e.ty ?? e, registry, visited, depth))
        .join(", ")
      return `[${elems}]`
    }

    case "TsUnionType":
      return node.types
        .map((t: any) => resolveType(t, registry, visited, depth))
        .join(" | ")

    case "TsIntersectionType":
      return node.types
        .map((t: any) => resolveType(t, registry, visited, depth))
        .join(" & ")

    case "TsTypeLiteral":
      return formatTypeLiteral(node, registry, visited, depth)

    case "TsFunctionType": {
      const params = node.params
        ?.map((p: any) => {
          const pName = p.pat?.value ?? p.pat?.left?.value ?? "_"
          const pType = resolveType(p.typeAnnotation?.typeAnnotation, registry, visited, depth)
          return `${pName}: ${pType}`
        })
        .join(", ")
      const ret = resolveType(node.typeAnnotation?.typeAnnotation, registry, visited, depth)
      return `(${params}) => ${ret}`
    }

    case "TsLiteralType": {
      const lit = node.literal
      if (lit.type === "StringLiteral") return `"${lit.value}"`
      if (lit.type === "NumericLiteral") return `${lit.value}`
      if (lit.type === "BooleanLiteral") return `${lit.value}`
      return String(lit.value)
    }

    case "TsParenthesizedType":
      return `(${resolveType(node.typeAnnotation, registry, visited, depth)})`

    case "TsOptionalType":
      return `${resolveType(node.typeAnnotation, registry, visited, depth)}?`

    case "TsRestType":
      return `...${resolveType(node.typeAnnotation, registry, visited, depth)}`

    case "TsConditionalType": {
      const check = resolveType(node.checkType, registry, visited, depth)
      const ext = resolveType(node.extendsType, registry, visited, depth)
      const tru = resolveType(node.trueType, registry, visited, depth)
      const fal = resolveType(node.falseType, registry, visited, depth)
      return `${check} extends ${ext} ? ${tru} : ${fal}`
    }

    case "TsMappedType": {
      const param = node.typeParam?.name?.value ?? "K"
      const constraint = resolveType(node.typeParam?.constraint, registry, visited, depth)
      const val = resolveType(node.typeAnnotation, registry, visited, depth)
      return `{ [${param} in ${constraint}]: ${val} }`
    }

    case "TsIndexedAccessType": {
      const obj = resolveType(node.objectType, registry, visited, depth)
      const idx = resolveType(node.indexType, registry, visited, depth)
      return `${obj}[${idx}]`
    }

    case "TsTypeOperator":
      return `${node.op} ${resolveType(node.typeAnnotation, registry, visited, depth)}`

    case "TsThisType":
      return "this"

    default:
      return "unknown"
  }
}

function resolveEntityName(node: any): string {
  if (!node) return "unknown"
  if (node.type === "Identifier") return node.value
  if (node.type === "TsQualifiedName") {
    return `${resolveEntityName(node.left)}.${node.right.value}`
  }
  return "unknown"
}

function expandRegisteredType(
  node: any,
  registry: TypeRegistry,
  visited: Set<string>,
  depth: number
): string {
  if (node.type === "TsTypeAliasDeclaration") {
    return resolveType(node.typeAnnotation, registry, visited, depth)
  }

  if (node.type === "TsInterfaceDeclaration") {
    return formatInterfaceBody(node.body, registry, visited, depth)
  }

  return "unknown"
}

function formatInterfaceBody(
  body: any,
  registry: TypeRegistry,
  visited: Set<string>,
  depth: number
): string {
  const members = body.body ?? []
  if (members.length === 0) return "{}"

  const indent = "  ".repeat(depth + 1)
  const closing = "  ".repeat(depth)

  const lines = members.map((m: any) => {
    if (m.type === "TsPropertySignature") {
      const key = m.key?.value ?? m.key?.raw ?? "unknown"
      const optional = m.optional ? "?" : ""
      const type = resolveType(m.typeAnnotation?.typeAnnotation, registry, visited, depth + 1)
      return `${indent}${key}${optional}: ${type}`
    }
    if (m.type === "TsMethodSignature") {
      const key = m.key?.value ?? "unknown"
      const params = m.params
        ?.map((p: any) => {
          const name = p.pat?.value ?? "_"
          const type = resolveType(p.typeAnnotation?.typeAnnotation, registry, visited, depth + 1)
          return `${name}: ${type}`
        })
        .join(", ")
      const ret = resolveType(m.typeAnn?.typeAnnotation, registry, visited, depth + 1)
      return `${indent}${key}(${params}): ${ret}`
    }
    if (m.type === "TsIndexSignature") {
      const param = m.params?.[0]
      const pName = param?.pat?.value ?? "key"
      const pType = resolveType(param?.typeAnnotation?.typeAnnotation, registry, visited, depth + 1)
      const valType = resolveType(m.typeAnnotation?.typeAnnotation, registry, visited, depth + 1)
      return `${indent}[${pName}: ${pType}]: ${valType}`
    }
    return `${indent}unknown`
  })

  return `{\n${lines.join("\n")}\n${closing}}`
}

function formatTypeLiteral(
  node: any,
  registry: TypeRegistry,
  visited: Set<string>,
  depth: number
): string {
  return formatInterfaceBody({ body: node.members }, registry, visited, depth)
}
