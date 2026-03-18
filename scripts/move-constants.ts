// @paladin/scripts/move-constants.ts
import { readdir, readFile, writeFile, stat } from "fs/promises"
import { join, relative, dirname } from "path"
import { existsSync } from "fs"
import jscodeshift from "jscodeshift"
import type { ASTPath, ExportNamedDeclaration } from "jscodeshift"

const UPPER_CASE_RE = /^[A-Z][A-Z0-9_]+$/
const j = jscodeshift.withParser("tsx")

// ─── Types ───────────────────────────────────────────────────────────

interface ConstantEntry {
  name: string
  sourceFile: string
  rawCode: string
}

interface FileChange {
  file: string
  description: string
  newContent: string
}

interface PackageReport {
  packageDir: string
  packageName: string
  constants: ConstantEntry[]
  changes: FileChange[]
}

// ─── Helpers ─────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".turbo", ".next",
  "coverage", ".git", "__generated__", "generated",
])

async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      results.push(...(await collectTsFiles(full)))
    } else if (
      entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      entry.name !== "constants.ts" &&
      !entry.name.endsWith(".d.ts")
    ) {
      results.push(full)
    }
  }
  return results
}

function makeRelativeImport(fromFile: string, toFile: string): string {
  let rel = relative(dirname(fromFile), toFile)
  if (!rel.startsWith(".")) rel = "./" + rel
  return rel.replace(/\.tsx?$/, "")
}

async function resolveWorkspacePackages(rootDir: string): Promise<string[]> {
  const pkgJsonPath = join(rootDir, "package.json")
  if (!existsSync(pkgJsonPath)) return [rootDir]

  const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
  const workspaceGlobs: string[] | undefined =
    pkgJson.workspaces?.packages ?? pkgJson.workspaces

  if (!workspaceGlobs || !Array.isArray(workspaceGlobs)) return [rootDir]

  // Expand workspace globs like "apps/*", "packages/*"
  const packageDirs: string[] = []
  for (const glob of workspaceGlobs) {
    const base = glob.replace(/\/?\*$/, "")
    const fullBase = join(rootDir, base)
    if (!existsSync(fullBase)) continue

    const entries = await readdir(fullBase, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidateDir = join(fullBase, entry.name)
      const candidatePkg = join(candidateDir, "package.json")
      if (existsSync(candidatePkg)) {
        packageDirs.push(candidateDir)
      }
    }
  }

  return packageDirs.length > 0 ? packageDirs : [rootDir]
}

// ─── Core: Analyze a single package ──────────────────────────────────

async function analyzePackage(packageDir: string): Promise<PackageReport> {
  const pkgJsonPath = join(packageDir, "package.json")
  let packageName = relative(process.cwd(), packageDir) || packageDir
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
      packageName = pkg.name ?? packageName
    } catch {}
  }

  const tsFiles = await collectTsFiles(packageDir)
  const fileSources = new Map<string, string>()
  for (const file of tsFiles) {
    fileSources.set(file, await readFile(file, "utf-8"))
  }

  // ── Phase 1: Find all UPPER_CASE exported constants ──

  const extracted: ConstantEntry[] = []
  const constantOrigins = new Map<string, string>() // name -> source file

  const parseableFiles: string[] = []

  for (const file of tsFiles) {
    const source = fileSources.get(file)!
    try {
      const root = j(source)
      // Verify it actually parses by accessing the AST
      root.find(j.Program)
      parseableFiles.push(file)

      root.find(j.ExportNamedDeclaration).forEach((path: ASTPath<ExportNamedDeclaration>) => {
        const decl = path.node.declaration
        if (!decl || decl.type !== "VariableDeclaration" || decl.kind !== "const") return

        for (const declarator of decl.declarations) {
          if (
            declarator.type === "VariableDeclarator" &&
            declarator.id.type === "Identifier" &&
            UPPER_CASE_RE.test(declarator.id.name)
          ) {
            const name = declarator.id.name
            const singleDecl = j.variableDeclaration("const", [declarator])
            const exportNode = j.exportNamedDeclaration(singleDecl)
            const rawCode = j([j.program([exportNode])]).toSource()

            extracted.push({ name, sourceFile: file, rawCode })
            constantOrigins.set(name, file)
          }
        }
      })
    } catch (err) {
      const relPath = relative(packageDir, file)
      console.warn(`  ⚠ Skipping unparseable file: ${relPath}`)
    }
  }

  if (extracted.length === 0) {
    return { packageDir, packageName, constants: extracted, changes: [] }
  }

  // Determine where constants.ts should live:
  // 1. Find an existing types.ts in the package — colocate with it
  // 2. Fall back to common source root of extracted constants
  const typesFile = tsFiles.find((f) => f.endsWith("/types.ts") || f.endsWith("\\types.ts"))
    ?? [...fileSources.keys()].find((f) => f.endsWith("/types.ts") || f.endsWith("\\types.ts"))

  let constantsDir: string

  if (typesFile) {
    constantsDir = dirname(typesFile)
  } else {
    const sourceFiles = [...new Set(extracted.map((e) => e.sourceFile))]
    const commonSourceRoot = sourceFiles
      .map((f) => dirname(relative(packageDir, f)))
      .reduce((common, dir) => {
        const commonParts = common.split("/")
        const dirParts = dir.split("/")
        const shared: string[] = []
        for (let i = 0; i < Math.min(commonParts.length, dirParts.length); i++) {
          if (commonParts[i] === dirParts[i]) shared.push(commonParts[i])
          else break
        }
        return shared.join("/")
      })

    constantsDir = commonSourceRoot
      ? join(packageDir, commonSourceRoot)
      : packageDir
  }

  const constantsFilePath = join(constantsDir, "constants.ts")
  const existingConstantsSource = existsSync(constantsFilePath)
    ? await readFile(constantsFilePath, "utf-8")
    : ""

  // ── Phase 2: Collect dependent imports for constants.ts ──
  // Walk the AST of each constant's declaration to find all referenced
  // identifiers (both value and type), then match those against the
  // file's imports to determine what constants.ts needs to import.

  const neededImports = new Map<string, { specifiers: Set<string>, isTypeOnly: Map<string, boolean>, originalFile: string }>()

  for (const file of parseableFiles) {
    const source = fileSources.get(file)!
    const root = j(source)
    const fileConstants = extracted.filter((e) => e.sourceFile === file)
    if (fileConstants.length === 0) continue

    // Collect all identifiers referenced within each constant's declaration
    const referencedIdents = new Set<string>()

    root.find(j.ExportNamedDeclaration).forEach((path: ASTPath<ExportNamedDeclaration>) => {
      const decl = path.node.declaration
      if (!decl || decl.type !== "VariableDeclaration" || decl.kind !== "const") return

      for (const declarator of decl.declarations) {
        if (
          declarator.type !== "VariableDeclarator" ||
          declarator.id.type !== "Identifier" ||
          !fileConstants.some((fc) => fc.name === declarator.id.type === "Identifier" && declarator.id.name)
        ) {
          // Check if this declarator is one of our constants
          if (
            declarator.type === "VariableDeclarator" &&
            declarator.id.type === "Identifier" &&
            fileConstants.some((fc) => fc.name === declarator.id.name)
          ) {
            // Walk the entire declarator subtree for identifiers
            const declRoot = j(j.variableDeclaration("const", [declarator]).toString())

            // Value identifiers
            declRoot.find(j.Identifier).forEach((idPath) => {
              const name = idPath.node.name
              // Skip the declarator's own name
              if (name === (declarator.id as any).name) return
              referencedIdents.add(name)
            })

            // Type annotation identifiers (TSTypeReference etc.)
            declRoot.find(j.TSTypeReference).forEach((tsPath) => {
              if (tsPath.node.typeName.type === "Identifier") {
                referencedIdents.add(tsPath.node.typeName.name)
              } else if (tsPath.node.typeName.type === "TSQualifiedName") {
                // e.g. Foo.Bar — grab the root
                let left = tsPath.node.typeName.left
                while (left.type === "TSQualifiedName") left = left.left
                if (left.type === "Identifier") referencedIdents.add(left.name)
              }
            })
          }
        }
      }
    })

    // Now match referenced identifiers against the file's imports
    // Build a map of local name -> import info
    const importMap = new Map<string, { source: string, importedName: string, kind: "default" | "named" | "namespace", isTypeImport: boolean }>()

    root.find(j.ImportDeclaration).forEach((importPath) => {
      const importSource = importPath.node.source.value as string
      const isTypeOnlyImport = importPath.node.importKind === "type"
      const specifiers = importPath.node.specifiers || []

      for (const spec of specifiers) {
        if (!spec.local) continue
        const isTypeSpec = isTypeOnlyImport || (spec.type === "ImportSpecifier" && (spec as any).importKind === "type")

        if (spec.type === "ImportDefaultSpecifier") {
          importMap.set(spec.local.name, { source: importSource, importedName: spec.local.name, kind: "default", isTypeImport: isTypeSpec })
        } else if (spec.type === "ImportSpecifier" && spec.imported?.type === "Identifier") {
          importMap.set(spec.local.name, { source: importSource, importedName: spec.imported.name, kind: "named", isTypeImport: isTypeSpec })
        } else if (spec.type === "ImportNamespaceSpecifier") {
          importMap.set(spec.local.name, { source: importSource, importedName: spec.local.name, kind: "namespace", isTypeImport: isTypeSpec })
        }
      }
    })

    for (const ident of referencedIdents) {
      const imp = importMap.get(ident)
      if (!imp) continue

      // Rebase relative imports to be relative to constants.ts
      let resolvedModule = imp.source
      if (imp.source.startsWith(".")) {
        const absoluteTarget = join(dirname(file), imp.source)
        resolvedModule = makeRelativeImport(constantsFilePath, absoluteTarget)
      }

      if (!neededImports.has(resolvedModule)) {
        neededImports.set(resolvedModule, { specifiers: new Set(), isTypeOnly: new Map(), originalFile: file })
      }

      const entry = neededImports.get(resolvedModule)!

      if (imp.kind === "default") {
        entry.specifiers.add(`default:${imp.importedName}`)
        entry.isTypeOnly.set(`default:${imp.importedName}`, imp.isTypeImport)
      } else if (imp.kind === "namespace") {
        entry.specifiers.add(`namespace:${imp.importedName}`)
        entry.isTypeOnly.set(`namespace:${imp.importedName}`, imp.isTypeImport)
      } else {
        entry.specifiers.add(imp.importedName)
        entry.isTypeOnly.set(imp.importedName, imp.isTypeImport)
      }
    }
  }

  // Build import lines, separating type-only from value imports
  const importLines: string[] = []
  for (const [mod, { specifiers, isTypeOnly }] of neededImports) {
    const specs = [...specifiers]
    const defaultSpec = specs.find((s) => s.startsWith("default:"))
    const namespaceSpec = specs.find((s) => s.startsWith("namespace:"))
    const namedSpecs = specs.filter((s) => !s.startsWith("default:") && !s.startsWith("namespace:"))

    // Split named specs into type-only and value imports
    const typeSpecs = namedSpecs.filter((s) => isTypeOnly.get(s))
    const valueSpecs = namedSpecs.filter((s) => !isTypeOnly.get(s))

    if (namespaceSpec) {
      const alias = namespaceSpec.split(":")[1]
      const typePrefix = isTypeOnly.get(namespaceSpec) ? "type " : ""
      importLines.push(`import ${typePrefix}* as ${alias} from "${mod}"`)
    }

    // If ALL specifiers (including default) are type-only, emit a single `import type`
    const allTypeOnly = specs.every((s) => isTypeOnly.get(s))

    if (!namespaceSpec && allTypeOnly && specs.length > 0) {
      const parts: string[] = []
      if (defaultSpec) parts.push(defaultSpec.split(":")[1])
      const allNamed = [...typeSpecs, ...valueSpecs]
      if (allNamed.length > 0) {
        const named = `{ ${allNamed.join(", ")} }`
        if (defaultSpec) {
          parts[0] = `${parts[0]}, ${named}`
        } else {
          parts.push(named)
        }
      }
      importLines.push(`import type ${parts.join("")} from "${mod}"`)
    } else if (!namespaceSpec) {
      // Emit value imports (with inline `type` for type-only specifiers if mixed)
      const allNamed = [
        ...valueSpecs,
        ...typeSpecs.map((s) => `type ${s}`),
      ]
      const parts: string[] = []
      if (defaultSpec) parts.push(defaultSpec.split(":")[1])
      if (allNamed.length > 0) {
        const named = `{ ${allNamed.join(", ")} }`
        if (defaultSpec) {
          parts[0] = `${parts[0]}, ${named}`
        } else {
          parts.push(named)
        }
      }
      if (parts.length > 0) {
        importLines.push(`import ${parts.join("")} from "${mod}"`)
      }
    }
  }

  // Build constants.ts content
  const constantsBlocks: string[] = []
  if (existingConstantsSource.trim()) {
    constantsBlocks.push(existingConstantsSource.trim())
  }
  if (importLines.length > 0 && !existingConstantsSource.trim()) {
    constantsBlocks.push(importLines.join("\n"))
    constantsBlocks.push("")
  } else if (importLines.length > 0) {
    // Prepend imports before existing content
    constantsBlocks.unshift(importLines.join("\n") + "\n")
  }
  for (const entry of extracted) {
    constantsBlocks.push(entry.rawCode)
  }

  const constantsContent = constantsBlocks.join("\n") + "\n"

  const changes: FileChange[] = []

  changes.push({
    file: constantsFilePath,
    description: existsSync(constantsFilePath)
      ? `Append ${extracted.length} constant(s)`
      : `Create with ${extracted.length} constant(s)`,
    newContent: constantsContent,
  })

  // ── Phase 3: Rewrite source files ──

  for (const file of tsFiles) {
    const source = fileSources.get(file)!
    const root = j(source)
    let modified = false

    const fileConstantNames = extracted
      .filter((e) => e.sourceFile === file)
      .map((e) => e.name)

    // 3a: Remove extracted constants from their origin file
    if (fileConstantNames.length > 0) {
      root.find(j.ExportNamedDeclaration).forEach((path: ASTPath<ExportNamedDeclaration>) => {
        const decl = path.node.declaration
        if (!decl || decl.type !== "VariableDeclaration" || decl.kind !== "const") return

        const remaining = decl.declarations.filter(
          (d) =>
            !(
              d.type === "VariableDeclarator" &&
              d.id.type === "Identifier" &&
              fileConstantNames.includes(d.id.name)
            )
        )

        if (remaining.length === 0) {
          j(path).remove()
          modified = true
        } else if (remaining.length < decl.declarations.length) {
          decl.declarations = remaining
          modified = true
        }
      })

      // Check if this file still references any of the moved constants
      const stillUsed = fileConstantNames.filter((name) => {
        let used = false
        root.find(j.Identifier, { name }).forEach((idPath) => {
          const pt = idPath.parent.node.type
          if (pt !== "ImportSpecifier" && pt !== "ExportSpecifier" && pt !== "VariableDeclarator") {
            used = true
          }
        })
        return used
      })

      if (stillUsed.length > 0) {
        const relImport = makeRelativeImport(file, constantsFilePath)
        const importDecl = j.importDeclaration(
          stillUsed.map((n) => j.importSpecifier(j.identifier(n))),
          j.literal(relImport)
        )
        const body = root.find(j.Program).get("body")
        const lastImportIdx = root
          .find(j.ImportDeclaration)
          .paths()
          .reduce((max, p) => Math.max(max, body.value.indexOf(p.node)), -1)

        body.value.splice(lastImportIdx + 1, 0, importDecl)
        modified = true
      }
    }

    // 3b: Rewrite imports in OTHER files that imported constants from origin files
    for (const [constName, originFile] of constantOrigins) {
      if (originFile === file) continue

      const expectedImportPath = makeRelativeImport(file, originFile)

      root.find(j.ImportDeclaration).forEach((importPath) => {
        const importSource = importPath.node.source.value as string
        // Normalize: strip index suffix for comparison
        const normalizedExpected = expectedImportPath.replace(/\/index$/, "")
        const normalizedActual = importSource.replace(/\/index$/, "")
        if (normalizedActual !== normalizedExpected) return

        const specifiers = importPath.node.specifiers || []
        const matchingSpecs = specifiers.filter(
          (s) =>
            s.type === "ImportSpecifier" &&
            s.imported?.type === "Identifier" &&
            s.imported.name === constName
        )
        if (matchingSpecs.length === 0) return

        const remainingSpecs = specifiers.filter(
          (s) =>
            !(
              s.type === "ImportSpecifier" &&
              s.imported?.type === "Identifier" &&
              s.imported.name === constName
            )
        )

        // Add/merge import from constants.ts
        const constRelImport = makeRelativeImport(file, constantsFilePath)
        const existingConstImports = root
          .find(j.ImportDeclaration, { source: { value: constRelImport } })
          .paths()

        if (existingConstImports.length > 0) {
          existingConstImports[0].node.specifiers!.push(
            j.importSpecifier(j.identifier(constName))
          )
        } else {
          const newImport = j.importDeclaration(
            [j.importSpecifier(j.identifier(constName))],
            j.literal(constRelImport)
          )
          j(importPath).insertAfter(newImport)
        }

        if (remainingSpecs.length === 0) {
          j(importPath).remove()
        } else {
          importPath.node.specifiers = remainingSpecs
        }

        modified = true
      })
    }

    if (modified) {
      changes.push({
        file,
        description: fileConstantNames.length > 0
          ? `Remove ${fileConstantNames.join(", ")} + update imports`
          : `Rewrite imports to use constants.ts`,
        newContent: root.toSource(),
      })
    }
  }

  return { packageDir, packageName, constants: extracted, changes }
}

// ─── Reporter ────────────────────────────────────────────────────────

function printReport(reports: PackageReport[]) {
  const totalConstants = reports.reduce((sum, r) => sum + r.constants.length, 0)
  const totalChanges = reports.reduce((sum, r) => sum + r.changes.length, 0)

  if (totalConstants === 0) {
    console.log("\n  No UPPER_CASE exported constants found anywhere.\n")
    return false
  }

  console.log("\n╔══════════════════════════════════════════════════╗")
  console.log("║          MOVE CONSTANTS — DRY RUN REPORT        ║")
  console.log("╚══════════════════════════════════════════════════╝\n")

  for (const report of reports) {
    if (report.constants.length === 0) continue

    const relDir = relative(process.cwd(), report.packageDir) || "."
    console.log(`┌─ 📦 ${report.packageName} (${relDir})`)
    console.log("│")

    console.log("│  Constants to move:")
    for (const c of report.constants) {
      const relSource = relative(report.packageDir, c.sourceFile)
      console.log(`│    • ${c.name}  ← ${relSource}`)
    }
    console.log("│")

    console.log("│  File changes:")
    for (const ch of report.changes) {
      const relFile = relative(report.packageDir, ch.file)
      console.log(`│    ✏️  ${relFile}`)
      console.log(`│       ${ch.description}`)
    }
    console.log("│")
    console.log(`└─ ${report.constants.length} constant(s), ${report.changes.length} file(s) affected\n`)
  }

  console.log(`  Total: ${totalConstants} constant(s) across ${reports.filter((r) => r.constants.length > 0).length} package(s), ${totalChanges} file change(s)\n`)

  return true
}

async function applyChanges(reports: PackageReport[]) {
  for (const report of reports) {
    for (const change of report.changes) {
      await writeFile(change.file, change.newContent, "utf-8")
    }
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────

async function main() {
  const targetDir = process.argv[2] || "/home/kdog3682/projects/paladin/"
  if (!targetDir) {
    console.error("Usage: bun run move-constants.ts <directory>")
    process.exit(1)
  }

  const resolvedDir = targetDir.replace(/^~/, process.env.HOME || "~")

  console.log(`\nScanning ${resolvedDir}...`)

  const packageDirs = await resolveWorkspacePackages(resolvedDir)
  console.log(`Found ${packageDirs.length} package(s) to process.`)

  const reports: PackageReport[] = []
  for (const pkgDir of packageDirs) {
    reports.push(await analyzePackage(pkgDir))
  }

  const hasChanges = printReport(reports)
  if (!hasChanges) return

  // Prompt for confirmation
  process.stdout.write("  Apply these changes? (y/N): ")
  for await (const line of console) {
    const answer = line.trim().toLowerCase()
    if (answer === "y" || answer === "yes") {
      await applyChanges(reports)
      console.log("\n  ✅ All changes applied.\n")
    } else {
      console.log("\n  ❌ Aborted. No files were modified.\n")
    }
    break
  }
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})

