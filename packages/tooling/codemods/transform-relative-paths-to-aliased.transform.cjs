const fs = require("node:fs")
const path = require("node:path")

const KNOWN_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]

function resolveFromImport(importerFile, importValue) {
  const importerDir = path.dirname(importerFile)
  const raw = path.resolve(importerDir, importValue)

  const candidates = [
    raw,
    ...KNOWN_EXTS.map((ext) => `${raw}${ext}`),
    ...KNOWN_EXTS.map((ext) => path.join(raw, `index${ext}`)),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }

  return null
}

function toAliasPath(absFile, webSrcRoot) {
  if (!absFile.startsWith(webSrcRoot + path.sep)) return null
  const rel = path.relative(webSrcRoot, absFile).replace(/\\/g, "/")
  const noExt = rel.replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "")
  return `@/${noExt}`
}

module.exports = function transform(fileInfo, api) {
  const j = api.jscodeshift
  const root = j(fileInfo.source)
  const webSrcRoot = path.resolve(process.cwd(), "apps/web/src")
  const filePath = path.resolve(fileInfo.path)
  let changed = false

  function rewriteLiteralPath(literal) {
    if (!literal || typeof literal.value !== "string") return
    const current = literal.value
    if (!current.startsWith(".")) return

    const resolved = resolveFromImport(filePath, current)
    if (!resolved) return

    const aliased = toAliasPath(resolved, webSrcRoot)
    if (!aliased || aliased === current) return

    literal.value = aliased
    changed = true
  }

  root.find(j.ImportDeclaration).forEach((p) => rewriteLiteralPath(p.node.source))
  root.find(j.ExportNamedDeclaration).forEach((p) => rewriteLiteralPath(p.node.source))
  root.find(j.ExportAllDeclaration).forEach((p) => rewriteLiteralPath(p.node.source))

  root
    .find(j.CallExpression)
    .filter(
      (p) =>
        p.node.callee &&
        p.node.callee.type === "Identifier" &&
        p.node.callee.name === "require" &&
        p.node.arguments.length === 1 &&
        p.node.arguments[0].type === "Literal" &&
        typeof p.node.arguments[0].value === "string"
    )
    .forEach((p) => rewriteLiteralPath(p.node.arguments[0]))

  root
    .find(j.ImportExpression)
    .filter(
      (p) =>
        p.node.source &&
        p.node.source.type === "Literal" &&
        typeof p.node.source.value === "string"
    )
    .forEach((p) => rewriteLiteralPath(p.node.source))

  if (!changed) return null
  return root.toSource({ quote: "double", trailingComma: true })
}
