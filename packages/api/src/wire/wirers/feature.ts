import path from "path"
import { readFileSafe, writeFileSafe } from "../../utils/fs"
import { parse, print } from "../ast/parse"
import { addImport } from "../ast/add-import"
import { extractExportedFns } from "../ast/extract-exports"
import { generateRoutesFile } from "../generators/routes-file"
import { generateDemoApplet } from "../generators/demo-applet"
import {
  isFeatureService,
  featureNameFromPath,
  pascal,
} from "../paths"
import { wireApplets } from "./applet"
import { b, n } from "../ast/parse"
import type { Wirer, WireContext, WirerResult } from "../types"

export const featureWirer: Wirer = {
  name: "feature",
  match: isFeatureService,
  async run(paths, ctx): Promise<WirerResult> {
    const written: string[] = []
    const modified: string[] = []
    const generatedAppletPaths: string[] = []

    for (const servicePath of paths) {
      const featureName = featureNameFromPath(servicePath)
      if (!featureName) continue

      const source = await readFileSafe(servicePath)
      if (!source) continue
      const ast = parse(source)
      const fns = extractExportedFns(ast)
      if (!fns.length) continue

      // 1. routes file
      const routesPath = path.join(
        path.dirname(servicePath),
        `${featureName}.routes.ts`,
      )
      await writeFileSafe(
        routesPath,
        generateRoutesFile(featureName, fns),
      )
      written.push(routesPath)

      // 2. register in routes index
      await registerRoute(ctx.apiRoutesIndexPath, featureName)
      modified.push(ctx.apiRoutesIndexPath)

      // 3. demo applet
      const appletName = `${pascal(featureName)}DemoApplet`
      const appletPath = path.join(
        ctx.appletsDir,
        `${appletName}.tsx`,
      )
      await writeFileSafe(
        appletPath,
        generateDemoApplet(featureName, fns),
      )
      written.push(appletPath)
      generatedAppletPaths.push(appletPath)
    }

    // 4. wire generated applets into App.tsx
    if (generatedAppletPaths.length) {
      const r = await wireApplets(generatedAppletPaths, ctx)
      if (r.modified) modified.push(...r.modified)
    }

    return { written, modified }
  },
}

async function registerRoute(
  routesIndexPath: string,
  featureName: string,
) {
  const source = await readFileSafe(routesIndexPath)
  if (!source)
    throw new Error(`routes index not found at ${routesIndexPath}`)
  const ast = parse(source)

  addImport(ast, {
    name: featureName,
    from: `./${featureName}`,
    kind: "default",
  })

  const body = ast.program.body
  const routePath = `/${featureName}`

  const already = body.some((node: any) => {
    if (!n.ExpressionStatement.check(node)) return false
    const call = node.expression
    if (!n.CallExpression.check(call)) return false
    const callee = call.callee
    if (!n.MemberExpression.check(callee)) return false
    if (
      !n.Identifier.check(callee.object) ||
      callee.object.name !== "app"
    )
      return false
    if (
      !n.Identifier.check(callee.property) ||
      callee.property.name !== "route"
    )
      return false
    const first = call.arguments?.[0]
    return n.StringLiteral.check(first) && first.value === routePath
  })
  if (already) {
    await writeFileSafe(routesIndexPath, print(ast))
    return
  }

  const stmt = b.expressionStatement(
    b.callExpression(
      b.memberExpression(b.identifier("app"), b.identifier("route")),
      [b.stringLiteral(routePath), b.identifier(featureName)],
    ),
  )

  let insertAt = -1
  body.forEach((node: any, i: number) => {
    if (
      n.ExpressionStatement.check(node) &&
      n.CallExpression.check(node.expression) &&
      n.MemberExpression.check(node.expression.callee) &&
      n.Identifier.check(node.expression.callee.object) &&
      node.expression.callee.object.name === "app" &&
      n.Identifier.check(node.expression.callee.property) &&
      node.expression.callee.property.name === "route"
    ) {
      insertAt = i
    }
  })
  if (insertAt === -1) {
    body.forEach((node: any, i: number) => {
      if (
        n.VariableDeclaration.check(node) &&
        node.declarations.some(
          (d: any) =>
            n.VariableDeclarator.check(d) &&
            n.Identifier.check(d.id) &&
            d.id.name === "app",
        )
      ) {
        insertAt = i
      }
    })
  }
  body.splice(insertAt + 1, 0, stmt)

  await writeFileSafe(routesIndexPath, print(ast))
}
