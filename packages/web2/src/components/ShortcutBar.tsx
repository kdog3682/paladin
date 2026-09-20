import { cn } from '@paladin/shadcn'

const SHORTCUTS = [
  ['⌥N', 'new'],
  ['⌥R', 'rename'],
  ['⌥D', 'delete'],
  ['⌥E', 'export'],
  ['⌥C', 'copy'],
  ['⌥F', 'search'],
  ['⌥↑/↓', 'switch'],
  ['⌥⇧1-0', 'set bookmark'],
  ['⌥1-0', 'go to bookmark'],
] as const

export type ShortcutBarProps = {
  className?: string
}

export const ShortcutBar = ({ className }: ShortcutBarProps) => (
  <footer
    className={cn(
      'flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 border-t border-border bg-muted/40 px-3 py-1',
      'text-[11px] text-muted-foreground',
      className,
    )}
  >
    {SHORTCUTS.map(([keys, label]) => (
      <span key={keys}>
        <kbd className="font-mono">{keys}</kbd> {label}
      </span>
    ))}
    <span className="ml-auto">right-click a note for options</span>
  </footer>
)
