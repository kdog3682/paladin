import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { expandHome } from '../utils/path'

const SUBLIME_DIR = expandHome('~/.config/sublime-text/Packages/User')
const SUBLIME_KEYMAP_FILE = join(SUBLIME_DIR, 'Default.sublime-keymap')
const SUBLIME_COMMANDS_FILE = join(SUBLIME_DIR, 'Default.sublime-commands')

// matches a header like '# @sublime/paladin_file_browser.py' or '// @sublime/Default.sublime-keymap'
const SUBLIME_HEADER_RE = /^\s*(?:#|\/\/)\s*@sublime\/(.+?)\s*$/
// matches a raw sublime packages path header, e.g. '# Packages/User/foo.py'
// or '# Sublime Text/User/foo.py'
const SUBLIME_PATH_RE = /^(\s*)(#|\/\/)\s*(?:Packages|Sublime Text)\/User\/(.+?)\s*$/
// matches a keys line like '# keys: ctrl+k'
const SUBLIME_KEYS_RE = /^\s*#\s*keys:\s*(.+?)\s*$/
// matches a sublime_plugin command class, e.g. 'class FooBarCommand(sublime_plugin.TextCommand):'
const SUBLIME_COMMAND_CLASS_RE = /class\s+(\w+)\(\s*sublime_plugin\.\w*Command\s*\)/g

interface KeymapBinding {
  keys: string[]
  command: string
  args?: unknown
}

interface PaletteEntry {
  caption: string
  command: string
}

// strips the header (and optional keys) line(s) off content so it can be
// written or parsed as plain data
function stripHeader(lines: string[], count: number): string {
  return lines.slice(count).join('\n').replace(/^\n+/, '')
}

// converts a PascalCase sublime_plugin command class name (e.g. 'FooBarCommand')
// into the snake_case command name Sublime derives for it at runtime (e.g. 'foo_bar')
function classNameToCommand(className: string): string {
  const snake = className
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
  return snake.endsWith('_command') ? snake.slice(0, -'_command'.length) : snake
}

// snake_case command name -> 'Title Case' caption for the command palette
function commandToCaption(command: string): string {
  return command
    .split('_')
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join(' ')
}

// scans python plugin source for sublime_plugin command classes and returns
// the runtime command name for each one found, in source order
function extractCommands(body: string): string[] {
  const commands: string[] = []
  for (const match of body.matchAll(SUBLIME_COMMAND_CLASS_RE)) {
    commands.push(classNameToCommand(match[1]))
  }
  return commands
}

// merges keybinding entries into a .sublime-keymap file, replacing any
// existing binding for the same command
async function mergeKeymap(dest: string, entries: KeymapBinding[]): Promise<void> {
  const raw = existsSync(dest) ? await Bun.file(dest).text() : '[]'
  const bindings: KeymapBinding[] = JSON.parse(raw || '[]')

  for (const entry of entries) {
    const idx = bindings.findIndex((b) => b.command === entry.command)
    if (idx === -1) bindings.push(entry)
    else bindings[idx] = entry
  }

  mkdirSync(dirname(dest), { recursive: true })
  await Bun.write(dest, JSON.stringify(bindings, null, 4) + '\n')
}

// merges command palette entries into a .sublime-commands file, replacing
// any existing entry for the same command
async function mergeCommandPalette(dest: string, entries: PaletteEntry[]): Promise<void> {
  const raw = existsSync(dest) ? await Bun.file(dest).text() : '[]'
  const existing: PaletteEntry[] = JSON.parse(raw || '[]')

  for (const entry of entries) {
    const idx = existing.findIndex((e) => e.command === entry.command)
    if (idx === -1) existing.push(entry)
    else existing[idx] = entry
  }

  mkdirSync(dirname(dest), { recursive: true })
  await Bun.write(dest, JSON.stringify(existing, null, 4) + '\n')
}

// shallow-merges a .sublime-settings file (covers both plugin settings like
// 'Side Bar.sublime-settings' and user preferences, 'Preferences.sublime-settings')
async function mergeSettings(dest: string, settings: Record<string, unknown>): Promise<void> {
  const raw = existsSync(dest) ? await Bun.file(dest).text() : '{}'
  const existing: Record<string, unknown> = JSON.parse(raw || '{}')
  const merged = { ...existing, ...settings }

  mkdirSync(dirname(dest), { recursive: true })
  await Bun.write(dest, JSON.stringify(merged, null, 4) + '\n')
}

// true if a file's first line is a sublime header: either an '@sublime/...'
// header or a raw 'Packages/User/...' path, commented with '#' or '//'
export function hasSublime(content: string): boolean {
  const line = content.split('\n', 1)[0] ?? ''
  return SUBLIME_HEADER_RE.test(line) || SUBLIME_PATH_RE.test(line)
}

// rewrites a raw 'Packages/User/<file>' header line into '@sublime/<file>' so
// it flows through the normal @sublime handling below
function normalizeSublimeHeader(content: string): string {
  const lines = content.split('\n')
  const match = lines[0]?.match(SUBLIME_PATH_RE)
  if (!match) return content

  const [, indent, marker, filename] = match
  lines[0] = `${indent}${marker} @sublime/${filename}`
  return lines.join('\n')
}

/**
 * Handles files whose header points at '@sublime/...'. Merge strategy is
 * dispatched per file suffix:
 *  - '.sublime-keymap': JSON array of keybindings, merged by command.
 *  - '.sublime-commands' / '.sublime-menu': JSON array of {caption, command}
 *    entries, merged by command.
 *  - '.sublime-settings': JSON object (plugin settings or user
 *    preferences), shallow-merged.
 *  - everything else (including '.py', '.html', '.json', '.txt', ...):
 *    written as-is, no merge. '.py' plugins additionally get scanned for
 *    sublime_plugin command classes, auto-registered in the command
 *    palette, and bound to a keymap entry if a 'keys:' line follows the
 *    header.
 */
export async function handleSublime(contents: string[]): Promise<boolean> {
  let handled = false

  for (const rawContent of contents) {
    const content = normalizeSublimeHeader(rawContent)
    const lines = content.split('\n')
    const headerMatch = lines[0]?.match(SUBLIME_HEADER_RE)
    if (!headerMatch) continue

    handled = true
    const filename = headerMatch[1]
    const dest = join(SUBLIME_DIR, filename)
    const body = stripHeader(lines, 1)

    if (filename.endsWith('.sublime-keymap')) {
      await mergeKeymap(dest, JSON.parse(body || '[]'))
      continue
    }

    if (filename.endsWith('.sublime-commands') || filename.endsWith('.sublime-menu')) {
      await mergeCommandPalette(dest, JSON.parse(body || '[]'))
      continue
    }

    if (filename.endsWith('.sublime-settings')) {
      await mergeSettings(dest, JSON.parse(body || '{}'))
      continue
    }

    mkdirSync(dirname(dest), { recursive: true })
    await Bun.write(dest, body)

    if (!filename.endsWith('.py')) continue

    const commands = extractCommands(body)
    if (commands.length === 0) continue

    await mergeCommandPalette(
      SUBLIME_COMMANDS_FILE,
      commands.map((command) => ({ caption: `User: ${commandToCaption(command)}`, command })),
    )

    const keysLine = lines.slice(1).find((l) => SUBLIME_KEYS_RE.test(l))
    if (keysLine) {
      const keys = keysLine.match(SUBLIME_KEYS_RE)![1].split(/\s*,\s*/)
      await mergeKeymap(SUBLIME_KEYMAP_FILE, [{ keys, command: commands[0] }])
    }
  }

  return handled
}
