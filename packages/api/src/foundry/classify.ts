// Derives a FileNode.kind from its path. Heuristic and cheap — the caller may
// override when it knows better (e.g. a kind declared in the file header).

import { basename } from 'path'
import type { Kind } from './types'

export function classifyKind(path: string): Kind {
  const base = basename(path)
  // Directory is the primary signal; filename suffix is the fallback.
  if (/(?:^|\/)(?:tests?|__tests__)\//.test(path) || /\.(test|spec)\.[jt]sx?$/.test(base)) return 'test'
  if (/(?:^|\/)demos?\//.test(path) || /\.demo\.[jt]sx?$/.test(base)) return 'demo'
  if (/(?:^|\/)scripts?\//.test(path) || /\.script\.[jt]sx?$/.test(base)) return 'script'
  if (base === 'package.json' || base === 'tsconfig.json' || /\.config\.[jt]s$/.test(base)) return 'config'
  return 'source'
}
