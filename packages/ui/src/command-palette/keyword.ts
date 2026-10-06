import type { PageCommand, PaletteCommand } from "./types"

export type KeywordMatch<Ctx, R> = {
  command: PageCommand<Ctx, R>
  /* the keyword as the user typed it */
  typed: string
  /* everything after the boundary whitespace */
  rest: string
}

/*
 * matches a root query of the form `<keyword>\s<rest>` against the first
 * keyword of each non-action command. the whitespace is the boundary, so
 * "note" never matches "notes". the longest keyword wins.
 */
export function matchKeyword<Ctx, R>(
  query: string,
  commands: Iterable<PaletteCommand<Ctx, R>>,
  ctx: Ctx,
): KeywordMatch<Ctx, R> | undefined {
  const lower = query.toLowerCase()
  let best: KeywordMatch<Ctx, R> | undefined

  for (const command of commands) {
    if (command.type === "action") continue
    const keyword = command.keywords[0]?.toLowerCase()
    if (!keyword) continue
    if (lower.length <= keyword.length) continue
    if (!lower.startsWith(keyword)) continue
    if (!/\s/.test(query[keyword.length])) continue
    if (command.when && !command.when(ctx)) continue
    if (best && best.typed.length >= keyword.length) continue
    best = {
      command,
      typed: query.slice(0, keyword.length),
      rest: query.slice(keyword.length + 1),
    }
  }

  return best
}
