import { n } from "./parse"

// walks a function body, returns true if any ReturnStatement has a non-undefined argument
export function hasMeaningfulReturn(fnNode: any): boolean {
  const body = fnNode.body
  if (!body) return false
  let found = false
  const walk = (node: any) => {
    if (found || !node || typeof node !== "object") return
    if (
      n.FunctionDeclaration.check(node) ||
      n.FunctionExpression.check(node) ||
      n.ArrowFunctionExpression.check(node)
    ) {
      if (node !== fnNode) return // don't descend into nested functions
    }
    if (n.ReturnStatement.check(node)) {
      const arg = node.argument
      if (!arg) return
      if (n.Identifier.check(arg) && arg.name === "undefined") return
      found = true
      return
    }
    for (const k of Object.keys(node)) {
      if (k === "loc" || k === "parent") continue
      const v = (node as any)[k]
      if (Array.isArray(v)) v.forEach(walk)
      else if (
        v &&
        typeof v === "object" &&
        typeof v.type === "string"
      )
        walk(v)
    }
  }
  walk(body)
  return found
}
