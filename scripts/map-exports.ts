// @paladin/scripts/map-exports.ts
import { Project, Node, SyntaxKind, SourceFile, type ExportedDeclarations } from "ts-morph"
import { resolve, relative, dirname } from "path"
import { parseArgs } from "util"

// --- Types ---

type ExportEntry = {
  file: string
  kind: "function" | "class" | "variable" | "type" | "other"
  calls: string[]
}

type ExportMap = Record<string, ExportEntry>

// --- CLI ---

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    dir: { type: "string", default: "." },
    entry: { type: "string" },
    format: { type: "string", default: "tree" },
  },
})

const dir = resolve(values.dir ?? ".")
const format = values.format ?? "tree"

function findEntry(dir: string, explicit?: string): string {
  if (explicit) return resolve(dir, explicit)

  for (const candidate of ["index.ts", "index.tsx", "main.ts", "main.tsx"]) {
    const p = resolve(dir, candidate)
    if (Bun.file(p).size) return p
  }

  throw new Error(`No entry file found in ${dir}. Pass --entry explicitly.`)
}

const entryPath = findEntry(dir, values.entry)

// --- Project setup ---

const project = new Project({
  tsConfigFilePath: resolve(dir, "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
})

project.addSourceFilesAtPaths(resolve(dir, "**/*.{ts,tsx}"))

const entryFile = project.getSourceFileOrThrow(entryPath)

// --- Step 1: Collect exported symbols from entry ---

function getExportedSymbols(entry: SourceFile): Map<string, ExportedDeclarations[]> {
  return entry.getExportedDeclarations()
}

// --- Step 2: Classify a declaration ---

function classifyDeclaration(decl: ExportedDeclarations): ExportEntry["kind"] {
  if (Node.isFunctionDeclaration(decl) || Node.isFunctionExpression(decl) || Node.isArrowFunction(decl)) {
    return "function"
  }
  if (Node.isClassDeclaration(decl)) return "class"
  if (Node.isVariableDeclaration(decl)) {
    const init = decl.getInitializer()
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      return "function"
    }
    return "variable"
  }
  if (Node.isTypeAliasDeclaration(decl) || Node.isInterfaceDeclaration(decl)) return "type"
  return "other"
}

// --- Step 3: Find in-directory call expressions within a declaration ---

function isInDirectory(sourceFile: SourceFile): boolean {
  return sourceFile.getFilePath().startsWith(dir)
}

function getCallsInDeclaration(
  decl: ExportedDeclarations,
  allExportNames: Set<string>
): string[] {
  const calls = new Set<string>()

  // Types have no runtime calls
  if (Node.isTypeAliasDeclaration(decl) || Node.isInterfaceDeclaration(decl)) {
    return []
  }

  // For variable declarations, analyze the initializer
  const nodeToWalk = Node.isVariableDeclaration(decl)
    ? decl.getInitializer() ?? decl
    : decl

  nodeToWalk.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return

    const expr = node.getExpression()
    let name: string | undefined

    // Direct call: foo()
    if (Node.isIdentifier(expr)) {
      name = expr.getText()
    }
    // Property access: obj.foo() — skip for now, could extend later

    if (!name) return

    // Check if this name is a known in-directory export
    if (allExportNames.has(name)) {
      calls.add(name)
      return
    }

    // Resolve via symbol to see if it points to an in-directory file
    const sym = expr.getSymbol()
    if (!sym) return

    const declarations = sym.getDeclarations()
    for (const d of declarations) {
      const sf = d.getSourceFile()
      if (isInDirectory(sf)) {
        const resolvedName = sym.getName()
        calls.add(resolvedName)
        break
      }
    }
  })

  return [...calls]
}

// --- Step 4: Build the map ---

function buildExportMap(entry: SourceFile): ExportMap {
  const exported = getExportedSymbols(entry)
  const allExportNames = new Set(exported.keys())
  const map: ExportMap = {}

  // First pass: register all entries
  for (const [name, declarations] of exported) {
    const decl = declarations[0]
    if (!decl) continue

    const sourceFile = decl.getSourceFile()
    const filePath = relative(dir, sourceFile.getFilePath())
    const kind = classifyDeclaration(decl)

    map[name] = {
      file: filePath,
      kind,
      calls: [],
    }
  }

  // Also collect all in-directory function names (not just entry exports)
  // so we can track internal calls too
  const allInDirFunctions = new Set<string>(allExportNames)
  for (const sf of project.getSourceFiles()) {
    if (!isInDirectory(sf)) continue
    for (const fn of sf.getFunctions()) {
      const name = fn.getName()
      if (name) allInDirFunctions.add(name)
    }
    for (const vd of sf.getVariableDeclarations()) {
      const init = vd.getInitializer()
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        allInDirFunctions.add(vd.getName())
      }
    }
  }

  // Second pass: find calls
  for (const [name, declarations] of exported) {
    const decl = declarations[0]
    if (!decl) continue
    map[name].calls = getCallsInDeclaration(decl, allInDirFunctions)
  }

  return map
}

const exportMap = buildExportMap(entryFile)

// --- Step 5: Output ---

function printJson(map: ExportMap) {
  console.log(JSON.stringify(map, null, 2))
}

function printTree(map: ExportMap) {
  const visited = new Set<string>()

  function printNode(name: string, prefix: string, isLast: boolean, isRoot: boolean) {
    const entry = map[name]
    const connector = isRoot ? "" : isLast ? "└── " : "├── "
    const label = entry
      ? `${name} (${entry.file})`
      : name

    if (!isRoot && visited.has(name)) {
      console.log(`${prefix}${connector}${label} [see above]`)
      return
    }

    console.log(`${prefix}${connector}${label}`)
    visited.add(name)

    if (!entry) return

    const calls = entry.calls
    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ")

    calls.forEach((call, i) => {
      const childIsLast = i === calls.length - 1
      printNode(call, childPrefix, childIsLast, false)
    })
  }

  const entries = Object.keys(map)
  entries.forEach((name, i) => {
    printNode(name, "", true, true)
    if (i < entries.length - 1) console.log()
  })
}

if (format === "json") {
  printJson(exportMap)
} else {
  printTree(exportMap)
}
