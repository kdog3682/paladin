// @paladin/scribe-ui/src/components/KeybindingHelp.tsx

import { useStore } from "../store"
import { useKeyBindingContext } from "../keybindings"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bklearn/shadcn"

function formatKey(binding: { key: string, meta?: boolean, shift?: boolean }) {
  const parts: string[] = []
  if (binding.meta) parts.push("cmd")
  if (binding.shift) parts.push("shift")
  const label = binding.key === " " ? "space" : binding.key.toLowerCase()
  parts.push(label)
  return parts.join(" + ")
}

export function KeybindingHelp() {
  const { setKeybindingHelpOpen } = useStore()
  const { getAll } = useKeyBindingContext()

  const bindings = getAll()

  return (
    <Dialog open onOpenChange={() => setKeybindingHelpOpen(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {bindings.map((b, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-muted-foreground">{b.description}</span>
              <kbd className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                {formatKey(b)}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
