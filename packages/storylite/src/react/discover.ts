// @paladin/storylite/src/react/discover.ts

import { parseSync } from "@swc/core"
import { readFileSync } from "fs"
import type { StoryModule, StoryExport } from "./types"
import type {
  Module,
  ExportDefaultExpression,
  ExportDeclaration,
  ObjectExpression,
  KeyValueProperty,
  Expression,
  Property,
  ModuleItem,
  ExpressionStatement,
  AssignmentExpression,
} from "@swc/types"

export function discover(files: string[]): StoryModule[] {
  return files.map((filePath) => {
    const source = readFileSync(filePath, "utf-8")
    const ast = parseSync(source, {
      syntax: "typescript",
      tsx: true,
    })

    const meta = extractDefaultMeta(ast)
    const namedExports = extractNamedExports(ast)
    const postAssignments = extractPostAssignments(ast, namedExports)
    const stories = mergeAssignments(namedExports, postAssignments)

    return {
      filePath,
      label: meta.label ?? inferLabel(filePath),
      desc: meta.desc ?? "",
      stories,
    }
  })
}

type ParsedMeta = {
  label?: string
  desc?: string
}

// -------------------------------------------------------------------
// default export — { component, label, desc, title }
// supports both CSF `title` and our `label`
// -------------------------------------------------------------------

function extractDefaultMeta(ast: Module): ParsedMeta {
  const meta: ParsedMeta = {}

  for (const node of ast.body) {
    if (node.type === "ExportDefaultExpression") {
      const expr = (node as ExportDefaultExpression).expression
      if (expr.type === "ObjectExpression") {
        const props = readObjectLiteral(expr as ObjectExpression)
        meta.label = asString(props.label) ?? asString(props.title)
        meta.desc = asString(props.desc) ?? asString(props.description)
      }
    }
  }

  return meta
}

// -------------------------------------------------------------------
// named exports — handles CSF1/2 (functions) and CSF3 (objects)
// -------------------------------------------------------------------

type RawExport = {
  exportName: string
  kind: "object" | "function" | "unknown"
  staticProps: Record<string, unknown>
}

function extractNamedExports(ast: Module): RawExport[] {
  const exports: RawExport[] = []

  for (const node of ast.body) {
    if (node.type !== "ExportDeclaration") continue
    const decl = (node as ExportDeclaration).declaration
    if (decl.type !== "VariableDeclaration") continue

    for (const declarator of decl.declarations) {
      if (declarator.id.type !== "Identifier") continue
      const exportName = declarator.id.value
      const init = declarator.init

      if (!init) {
        exports.push({ exportName, kind: "unknown", staticProps: {} })
        continue
      }

      if (init.type === "ObjectExpression") {
        // CSF3: export const Primary = { args: {...}, render: ... }
        const obj = readObjectLiteral(init as ObjectExpression)
        exports.push({ exportName, kind: "object", staticProps: obj })
      } else if (
        init.type === "ArrowFunctionExpression" ||
        init.type === "FunctionExpression"
      ) {
        // CSF1/2: export const Primary = (args) => <Button {...args} />
        exports.push({ exportName, kind: "function", staticProps: {} })
      } else {
        exports.push({ exportName, kind: "unknown", staticProps: {} })
      }
    }
  }

  return exports
}

// -------------------------------------------------------------------
// post-declaration assignments: Primary.args = {...}, Primary.storyName = "..."
// -------------------------------------------------------------------

type PostAssignment = {
  target: string      // "Primary"
  property: string    // "args" | "storyName" | "decorators"
  value: unknown
}

function extractPostAssignments(ast: Module, known: RawExport[]): PostAssignment[] {
  const knownNames = new Set(known.map((e) => e.exportName))
  const assignments: PostAssignment[] = []

  for (const node of ast.body) {
    if (node.type !== "ExpressionStatement") continue
    const expr = (node as ExpressionStatement).expression
    if (expr.type !== "AssignmentExpression") continue

    const assign = expr as AssignmentExpression
    if (assign.left.type !== "MemberExpression") continue

    const member = assign.left
    if (member.object.type !== "Identifier") continue
    if (member.property.type !== "Identifier") continue

    const target = member.object.value
    const property = member.property.value

    if (!knownNames.has(target)) continue

    assignments.push({
      target,
      property,
      value: resolveStaticValue(assign.right),
    })
  }

  return assignments
}

// -------------------------------------------------------------------
// merge exports + post-assignments into final StoryExport[]
// -------------------------------------------------------------------

function mergeAssignments(
  rawExports: RawExport[],
  assignments: PostAssignment[]
): StoryExport[] {
  const assignmentMap = new Map<string, Record<string, unknown>>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.target)) assignmentMap.set(a.target, {})
    assignmentMap.get(a.target)![a.property] = a.value
  }

  return rawExports.map((raw) => {
    const post = assignmentMap.get(raw.exportName) ?? {}

    // args: CSF3 has them in the object literal, CSF2 attaches them after
    const args = (raw.staticProps.args as Record<string, unknown>)
      ?? (post.args as Record<string, unknown>)
      ?? {}

    // label: CSF allows .storyName override, also check object literal
    const label = asString(post.storyName)
      ?? asString(raw.staticProps.storyName)
      ?? asString(raw.staticProps.name)
      ?? humanize(raw.exportName)

    const desc = asString(raw.staticProps.desc)
      ?? asString(raw.staticProps.description)
      ?? ""

    return {
      exportName: raw.exportName,
      label,
      desc,
      props: args,
    }
  })
}

// -------------------------------------------------------------------
// AST helpers
// -------------------------------------------------------------------

function readObjectLiteral(obj: ObjectExpression): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const prop of obj.properties) {
    if (!isKeyValueProperty(prop)) continue
    const key = resolvePropertyKey(prop)
    if (!key) continue
    result[key] = resolveStaticValue(prop.value)
  }

  return result
}

function isKeyValueProperty(prop: Property): prop is KeyValueProperty {
  return prop.type === "KeyValueProperty"
}

function resolvePropertyKey(prop: KeyValueProperty): string | null {
  if (prop.key.type === "Identifier") return prop.key.value
  if (prop.key.type === "StringLiteral") return prop.key.value
  return null
}

function resolveStaticValue(expr: Expression): unknown {
  switch (expr.type) {
    case "StringLiteral":
      return expr.value
    case "NumericLiteral":
      return expr.value
    case "BooleanLiteral":
      return expr.value
    case "NullLiteral":
      return null
    case "ObjectExpression":
      return readObjectLiteral(expr as ObjectExpression)
    case "ArrayExpression":
      return expr.elements
        .filter((el) => el !== null && el.expression)
        .map((el) => resolveStaticValue(el!.expression))
    default:
      return undefined
  }
}

function asString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined
}

function inferLabel(filePath: string): string {
  const filename = filePath.split("/").pop() ?? ""
  const name = filename.replace(/\.(story|stories)\.(tsx?|jsx?)$/, "")
  return humanize(name)
}

function humanize(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
}
