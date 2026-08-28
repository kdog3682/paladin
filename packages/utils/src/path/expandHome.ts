import { homedir } from 'os'
import { join } from 'path'

export function expandHome(path: string): string {
  if (path == undefined) {
    throw new Error("expandHome path was given an undefined value. most likely, it is because opts.pathResolution.base was set as undefined")
  }
  if (!path.startsWith('~')) return path
  if (path === '~') return homedir()
  return join(homedir(), path.slice(2))
}
