import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import type { RuleContext } from './types'

/* blocks a rule inside the named syntax nodes, eg notIn('CodeText', 'FencedCode', 'InlineCode') */
export function notIn(...names: string[]) {
  return (ctx: RuleContext): boolean => {
    let node: SyntaxNode | null = syntaxTree(ctx.state).resolveInner(ctx.range.from, -1)
    for (; node; node = node.parent) {
      if (names.includes(node.name)) return false
    }
    return true
  }
}

/* the inverse: only allows a rule inside the named nodes */
export function onlyIn(...names: string[]) {
  const blocked = notIn(...names)
  return (ctx: RuleContext): boolean => !blocked(ctx)
}

/* allows a rule only when nothing but whitespace follows the cursor */
export function atLineEnd(ctx: RuleContext): boolean {
  return ctx.after.trim() === ''
}
