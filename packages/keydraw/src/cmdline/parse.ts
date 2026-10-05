export const COMMAND_NAMES = [
  "new",
  "open",
  "rename",
  "defaults",
  "keys",
  "board",
  "comp",
  "style",
  "icon",
  "name",
  "set",
  "unwrap",
  "lock",
  "hide",
  "export",
  "help",
  "map",
  "unmap",
  "alias",
  "unalias",
]

export type Parsed =
  | { kind: "empty" }
  | { kind: "command", name: string, args: string[], rest: string }
  /* anything else is a property-token line, applied to the selection like Input mode */
  | { kind: "tokens", line: string }

export function parseCmd(line: string): Parsed {
  const trimmed = line.trim()
  if (!trimmed) return { kind: "empty" }
  const [name, ...args] = trimmed.split(/\s+/)
  if (COMMAND_NAMES.includes(name)) return { kind: "command", name, args, rest: trimmed.slice(name.length).trim() }
  return { kind: "tokens", line: trimmed }
}
