import { n } from "./parse"

interface AddOpts {
  arrayName: string
  element: any
  dedupeKey?: string // property name to dedupe by (e.g., 'id')
}

export function addToArray(ast: any, opts: AddOpts) {
  const { arrayName, element, dedupeKey } = opts
  let target: any = null
  recastVisit(ast, (node: any) => {
    if (
      n.VariableDeclarator.check(node) &&
      n.Identifier.check(node.id) &&
      node.id.name === arrayName &&
      n.ArrayExpression.check(node.init)
    ) {
      target = node.init
    }
  })
  if (!target) throw new Error(`array ${arrayName} not found`)
  if (dedupeKey) {
    const newKey = getProp(element, dedupeKey)
    const exists = target.elements.some(
      (el: any) => getProp(el, dedupeKey) === newKey,
    )
    if (exists) return
  }
  target.elements.push(element)
}

function getProp(objExpr: any, key: string): string | undefined {
  if (!n.ObjectExpression.check(objExpr)) return
  for (const p of objExpr.properties) {
    if (!n.ObjectProperty.check(p) && !n.Property.check(p)) continue
    const k = p.key
    const name = n.Identifier.check(k)
      ? k.name
      : n.Literal.check(k)
        ? String(k.value)
        : null
    if (name !== key) continue
    const v = p.value
    if (n.Literal.check(v) || n.StringLiteral?.check?.(v))
      return String((v as any).value)
  }
}

function recastVisit(ast: any, fn: (node: any) => void) {
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return
    fn(node)
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
  walk(ast.program ?? ast)
}
