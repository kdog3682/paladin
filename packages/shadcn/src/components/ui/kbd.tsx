import { cn } from "cn"

const KEY_SYMBOLS: Record<string, string> = {
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  shift: "⇧",
  alt: "⌥",
  option: "⌥",
  opt: "⌥",
  ctrl: "⌃",
  control: "⌃",
  enter: "⏎",
  return: "⏎",
  esc: "⎋",
  escape: "⎋",
  tab: "⇥",
  backspace: "⌫",
  delete: "⌦",
  space: "␣",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
}

const KEY_WORDS: Record<string, string> = {
  cmd: "Ctrl",
  command: "Ctrl",
  meta: "Ctrl",
  ctrl: "Ctrl",
  control: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
  enter: "Enter",
  return: "Enter",
  esc: "Esc",
  escape: "Esc",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Del",
  space: "Space",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
}

function keyLabel(key: string, symbols: boolean) {
  const map = symbols ? KEY_SYMBOLS : KEY_WORDS
  return map[key.toLowerCase()] ?? key
}

function KbdKey({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-[5px] border bg-neutral-100 px-1.5 pt-[5px] pb-1 font-mono text-[10px] text-muted-foreground select-none dark:border-white dark:bg-white/10 in-data-[slot=tooltip-content]:border-background/20 in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10",
        className
      )}
      {...props}
    />
  )
}

/* A string child like "cmd+shift+k" is split on "+" into one key per part,
 * with modifier/named keys shown as words (Ctrl Shift Enter ...), or as
 * symbols (⌘ ⇧ ⏎ ...) when `symbols` is set. Any other children render as a
 * single key. */
function Kbd({
  children,
  className,
  symbols = false,
  ...props
}: React.ComponentProps<"kbd"> & { symbols?: boolean }) {
  if (children == null) {
    return
  }
  if (typeof children === "string" && children.length > 1 && children.includes("+")) {
    const keys = children.split("+").map((k) => k.trim()).filter(Boolean)
    return (
      <KbdGroup className={className}>
        {keys.map((key, i) => (
          <KbdKey key={i} {...props}>
            {keyLabel(key, symbols)}
          </KbdKey>
        ))}
      </KbdGroup>
    )
  }
  return (
    <KbdKey className={className} {...props}>
      {typeof children === "string" ? keyLabel(children, symbols) : children}
    </KbdKey>
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
