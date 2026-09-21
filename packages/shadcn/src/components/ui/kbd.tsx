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

function keyLabel(key: string) {
  return KEY_SYMBOLS[key.toLowerCase()] ?? key
}

function KbdKey({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-4 w-fit min-w-4 items-center justify-center gap-0.5 rounded-[4px] border-[0.5px] border-[#36454f] bg-neutral-100 px-1 font-mono text-[10px] font-medium text-muted-foreground select-none dark:border-white dark:bg-white/10 in-data-[slot=tooltip-content]:border-background/20 in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-2.5",
        className
      )}
      {...props}
    />
  )
}

/* A string child like "cmd+shift+k" is split on "+" into one key per part,
 * with modifier/named keys shown as symbols (⌘ ⇧ ⏎ ...). Any other children
 * render as a single key. */
function Kbd({ children, className, ...props }: React.ComponentProps<"kbd">) {
  if (typeof children === "string" && children.length > 1 && children.includes("+")) {
    const keys = children.split("+").map((k) => k.trim()).filter(Boolean)
    return (
      <KbdGroup className={className}>
        {keys.map((key, i) => (
          <KbdKey key={i} {...props}>
            {keyLabel(key)}
          </KbdKey>
        ))}
      </KbdGroup>
    )
  }
  return (
    <KbdKey className={className} {...props}>
      {typeof children === "string" ? keyLabel(children) : children}
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
