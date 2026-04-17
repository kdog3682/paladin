import { n } from "./parse"
import { parseRouteComment } from "./parse-route-comment"
import { extractParamTypes } from "./extract-param-types"
import { hasMeaningfulReturn } from "./extract-return-shape"
import type { ExportedFn } from "../types"

export function extractExportedFns(ast: any): ExportedFn[] {
  const out: ExportedFn[] = []
  for (const node of ast.program.body) {
    if (!n.ExportNamedDeclaration.check(node)) continue
    const decl = node.declaration
    if (!decl) continue

    // leading comments live on the ExportNamedDeclaration
    const routeComment = parseRouteComment(node.comments)

    if (n.FunctionDeclaration.check(decl)) {
      if (!routeComment) continue
      out.push({
        name: decl.id?.name ?? "",
        method: routeComment.method,
        route: routeComment.path,
        params: extractParamTypes(decl.params),
        hasReturn: hasMeaningfulReturn(decl),
      })
    }

    // export const foo = async () => {}
    if (n.VariableDeclaration.check(decl)) {
      for (const v of decl.declarations) {
        if (!n.VariableDeclarator.check(v)) continue
        if (!n.Identifier.check(v.id)) continue
        const init = v.init
        if (
          !init ||
          (!n.ArrowFunctionExpression.check(init) &&
            !n.FunctionExpression.check(init))
        )
          continue
        if (!routeComment) continue
        out.push({
          name: v.id.name,
          method: routeComment.method,
          route: routeComment.path,
          params: extractParamTypes(init.params),
          hasReturn: hasMeaningfulReturn(init),
        })
      }
    }
  }
  return out
}
