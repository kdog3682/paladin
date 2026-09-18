import { Node, type Project, type SourceFile } from "ts-morph"
import { getReExportTargets, redirectExports, type ExportMap } from "../utils/redirect"
import { deleteFile } from "../utils/source-files"
import { createWordReplacer, getCaseVariants, mapCommentsAndStrings } from "../utils/text"

// Dissolves a barrel file that only re-exports (`export { A as B } from "./a"`):
// every consumer is pointed at the real module and real names, the barrel is deleted,
// and mentions of the old names in comments and strings are rewritten with casing
// preserved. The words to rewrite come from the barrel itself: each renamed export
// (B -> A), plus the barrel's file name -> the target's file name when everything
// it re-exports comes from a single file.
export function removeBarrel(project: Project, barrelPath: string, rewriteText = true) {
  const barrel = project.getSourceFileOrThrow(barrelPath)
  assertPureBarrel(barrel)

  const targets = getReExportTargets(barrel)
  const words = getRenamedWords(barrel, targets)

  redirectExports(project, barrel, targets)
  deleteFile(project, barrel)

  if (!rewriteText || !words.length) return
  const replace = createWordReplacer(words.flatMap(([from, to]) => getCaseVariants(from, to)))
  for (const file of project.getSourceFiles()) {
    if (file.isDeclarationFile() || file.isInNodeModules()) continue
    mapCommentsAndStrings(file, replace)
  }
}

function assertPureBarrel(barrel: SourceFile) {
  for (const statement of barrel.getStatements()) {
    const ok = Node.isExportDeclaration(statement)
      && statement.hasNamedExports()
      && statement.getModuleSpecifierSourceFile() !== undefined
    if (!ok) throw new Error(`removeBarrel: ${barrel.getFilePath()} must only contain named re-exports, found: ${statement.getText()}`)
  }
}

// symbol renames come first so they win over the file name pair for shared casings
// (Cobject -> VMobject beats the Cobject -> Vmobject that cobject -> vmobject would give)
function getRenamedWords(barrel: SourceFile, targets: ExportMap): [string, string][] {
  const words: [string, string][] = [...targets]
    .filter(([exported, { name }]) => exported !== name)
    .map(([exported, { name }]) => [exported, name])

  const files = new Set([...targets.values()].map(target => target.file))
  if (files.size === 1) {
    const [target] = files
    words.push([barrel.getBaseNameWithoutExtension(), target!.getBaseNameWithoutExtension()])
  }
  return words
}
