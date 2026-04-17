import { b, n } from "./parse"

interface AddImportOpts {
  name: string
  from: string
  kind?: "default" | "named"
}

export function addImport(ast: any, opts: AddImportOpts) {
  const { name, from, kind = "named" } = opts
  const body = ast.program.body
  // check existing import from same source
  for (const node of body) {
    if (!n.ImportDeclaration.check(node)) continue
    if (node.source.value !== from) continue
    const already = node.specifiers?.some((s: any) => {
      if (kind === "default")
        return (
          n.ImportDefaultSpecifier.check(s) && s.local?.name === name
        )
      return n.ImportSpecifier.check(s) && s.imported?.name === name
    })
    if (already) return
    if (kind === "named") {
      node.specifiers.push(b.importSpecifier(b.identifier(name)))
      return
    }
  }
  const spec =
    kind === "default"
      ? b.importDefaultSpecifier(b.identifier(name))
      : b.importSpecifier(b.identifier(name))
  const decl = b.importDeclaration([spec], b.literal(from))
  // insert after last existing import, else at top
  let lastImport = -1
  body.forEach((node: any, i: number) => {
    if (n.ImportDeclaration.check(node)) lastImport = i
  })
  body.splice(lastImport + 1, 0, decl)
}
