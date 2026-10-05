/* scope ("normal", "move", "normal:search", …) → lhs → command id */
export type ScopeTable = Record<string, Record<string, string>>

/**
 * Merges binding/alias tables scope by scope. Later tables win per key.
 * Feature modules export their own tables; keymap.default.ts merges them in.
 */
export function mergeScopes(...tables: ScopeTable[]): ScopeTable {
  const out: ScopeTable = {}
  for (const t of tables) {
    for (const [scope, map] of Object.entries(t)) out[scope] = { ...out[scope], ...map }
  }
  return out
}
