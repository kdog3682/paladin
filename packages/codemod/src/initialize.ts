import { existsSync, statSync } from "node:fs"
import { dirname, join, parse, resolve } from "node:path"
import { IndentationText, Project, QuoteKind, ts } from "ts-morph"

const IGNORED_DIRS = [
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "assets",
  "public",
  "static",
  ".next",
  ".turbo",
  ".cache",
]

const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  strict: true,
  allowJs: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  noEmit: true,
}

export function resolveDirectory(path: string): string {
  const absolute = resolve(path)

  if (!existsSync(absolute)) {
    throw new Error(`initializeProject: path does not exist: ${absolute}`)
  }

  return statSync(absolute).isDirectory() ? absolute : dirname(absolute)
}

export function findTsConfig(dir: string): string | undefined {
  const { root } = parse(dir)
  let current = dir

  while (true) {
    const candidate = join(current, "tsconfig.json")
    if (existsSync(candidate)) return candidate
    if (current === root) return undefined
    current = dirname(current)
  }
}

export function initializeProject(path: string): Project {
  const dir = resolveDirectory(path)
  const tsConfigFilePath = findTsConfig(dir)

  const project = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: tsConfigFilePath ? undefined : DEFAULT_COMPILER_OPTIONS,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Double,
      useTrailingCommas: true,
      semicolons: ts.SemicolonPreference.Remove,
    },
  })

  project.addSourceFilesAtPaths([
    join(dir, "**/*.{ts,tsx,mts,cts}"),
    `!${join(dir, "**/*.d.ts")}`,
    ...IGNORED_DIRS.map((name) => `!${join(dir, "**", name, "**")}`),
  ])

  return project
}
