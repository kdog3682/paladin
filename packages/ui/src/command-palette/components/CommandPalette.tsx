import type { KeyboardEvent } from "react"
import { Dialog, DialogContent, DialogTitle, cn } from "@paladin/shadcn"
import { usePalette, usePaletteState, useTopPage } from "../context"
import { resolveKey } from "../keys"
import { ArgsPage } from "./ArgsPage"
import { Breadcrumb } from "./Breadcrumb"
import { FooterHints } from "./FooterHints"
import { ListPage } from "./ListPage"
import { RootPage } from "./RootPage"
import { TextPage } from "./TextPage"

export type CommandPaletteProps = {
  /* extra classes for the dialog surface */
  className?: string
}

function PageView() {
  const page = useTopPage()
  switch (page.type) {
    case "root":
      return <RootPage />
    case "list":
      return <ListPage />
    case "args":
      return <ArgsPage />
    case "text":
      return <TextPage />
  }
}

function PageError() {
  const error = usePaletteState((s) => s.error)
  if (!error) return null
  return (
    <div role="alert" className="text-destructive px-3 py-2 text-xs">
      {error}
    </div>
  )
}

export function CommandPalette({ className }: CommandPaletteProps) {
  const palette = usePalette()
  const open = usePaletteState((s) => s.open)
  const depth = usePaletteState((s) => s.pages.length)

  /*
   * capture phase, so the key table runs before cmdk and the inputs.
   * escape never leaves the palette: it is always the topmost layer.
   */
  function onKeyDownCapture(e: KeyboardEvent) {
    if (e.key === "Escape") e.stopPropagation()
    const state = palette.store.getState()
    const page = state.pages[state.pages.length - 1]
    const intent = resolveKey(
      page,
      {
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        isComposing: e.nativeEvent.isComposing,
      },
      state,
    )
    if (intent.type === "pass") return
    e.preventDefault()
    palette.actions.dispatch(intent)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        /* escape is ours: it pops a page before it closes */
        if (details.reason === "escape-key") return details.cancel()
        if (!next) palette.actions.close()
      }}
    >
      <DialogContent
        showCloseButton={false}
        /* focus is restored by the palette or the host's onDone */
        finalFocus={false}
        className={cn(
          "top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl",
          className,
        )}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex flex-col" onKeyDownCapture={onKeyDownCapture}>
          <Breadcrumb />
          {/* remount per depth so each page autofocuses its own input */}
          <PageView key={depth} />
          <PageError />
          <FooterHints />
        </div>
      </DialogContent>
    </Dialog>
  )
}
