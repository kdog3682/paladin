import type { Project, SourceFile } from "ts-morph"

export type ExportTreeOpts = {
  /** the barrel the tree is built from, matched against the end of each file path */
  entry?: string
  /** list the public names each file provides next to it */
  names?: boolean
}

type TreeNode = {
  /** subdirectories by base name */
  dirs: Map<string, TreeNode>
  /** files by base name -> the public names they provide */
  files: Map<string, string[]>
}

/**
 * Builds a file tree of only the files that back the public surface of a barrel.
 * Re-export chains (`export *`, `export { a as b } from`, nested barrels) are followed
 * to the file that actually declares each export, so files nothing exports are left out.
 * Declarations from node_modules or .d.ts files are skipped. The barrel itself is always listed.
 */
export function exportTree(project: Project, opts: ExportTreeOpts = {}): string {
  const { entry = "src/index.ts", names = false } = opts
  const barrel = project.getSourceFile(entry)
  if (!barrel) throw new Error(`exportTree: no source file matching ${entry}`)

  const root = barrel.getDirectory()
  const tree = createNode()
  for (const [file, exportNames] of collectExportedFiles(barrel)) {
    const relative = root.getRelativePathTo(file).replace(/^\.\//, "")
    insert(tree, relative.split("/"), names ? [...exportNames].sort() : [])
  }

  return [`${root.getBaseName()}/`, ...render(tree, "")].join("\n")
}

/** Codemod entry: logs the tree and returns it. */
export function printExportTree(project: Project, opts: ExportTreeOpts = {}): string {
  const tree = exportTree(project, opts)
  console.log(tree)
  return tree
}

/** Maps each file that declares something the barrel exports to the public names it provides. */
function collectExportedFiles(barrel: SourceFile): Map<SourceFile, Set<string>> {
  const files = new Map<SourceFile, Set<string>>([[barrel, new Set()]])
  for (const [name, declarations] of barrel.getExportedDeclarations()) {
    for (const declaration of declarations) {
      const file = declaration.getSourceFile()
      if (file.isInNodeModules() || file.isDeclarationFile()) continue
      let exportNames = files.get(file)
      if (!exportNames) files.set(file, (exportNames = new Set()))
      exportNames.add(name)
    }
  }
  return files
}

function createNode(): TreeNode {
  return { dirs: new Map(), files: new Map() }
}

function insert(node: TreeNode, segments: string[], exportNames: string[]): void {
  const [head, ...rest] = segments
  if (rest.length === 0) {
    node.files.set(head, exportNames)
    return
  }
  let child = node.dirs.get(head)
  if (!child) node.dirs.set(head, (child = createNode()))
  insert(child, rest, exportNames)
}

/** Renders directories first, then files, each group sorted alphabetically. */
function render(node: TreeNode, prefix: string): string[] {
  const dirNames = [...node.dirs.keys()].sort()
  const fileNames = [...node.files.keys()].sort()
  const total = dirNames.length + fileNames.length
  const lines: string[] = []
  let index = 0

  for (const name of dirNames) {
    const last = ++index === total
    lines.push(`${prefix}${last ? "└── " : "├── "}${name}/`)
    lines.push(...render(node.dirs.get(name)!, prefix + (last ? "    " : "│   ")))
  }

  for (const name of fileNames) {
    const last = ++index === total
    const exportNames = node.files.get(name)!
    const suffix = exportNames.length ? ` (${exportNames.join(", ")})` : ""
    lines.push(`${prefix}${last ? "└── " : "├── "}${name}${suffix}`)
  }

  return lines
}
