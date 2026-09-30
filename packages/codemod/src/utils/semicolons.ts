import { Node, type Project, SyntaxKind } from 'ts-morph'

const LINE_END_SEMICOLON = /;[ \t]*$/m

/**
 * ts-morph prints a `;` after every import, export and member it inserts, and has no setting to
 * stop it. So a file that had no line-ending semicolons before the codemods ran gets its new ones
 * stripped again. A `;` between members on one line (`{ a: string; b: number }`) is left alone.
 */
export async function withoutInsertedSemicolons<T>(project: Project, work: () => Promise<T>): Promise<T> {
  const before = new Map(project.getSourceFiles().map(file => [file.getFilePath(), file.getFullText()]))
  const result = await work()

  for (const file of project.getSourceFiles()) {
    const original = before.get(file.getFilePath())
    if (original === undefined || LINE_END_SEMICOLON.test(original)) continue

    const text = file.getFullText()
    if (text === original) continue

    const starts = file
      .getDescendantsOfKind(SyntaxKind.SemicolonToken)
      .filter(token => !Node.isForStatement(token.getParent()) && /^[ \t]*(\r?\n|$)/.test(text.slice(token.getEnd())))
      .map(token => token.getStart())
      .sort((a, b) => b - a)

    if (starts.length === 0) continue
    file.replaceWithText(starts.reduce((out, start) => out.slice(0, start) + out.slice(start + 1), text))
  }

  return result
}
