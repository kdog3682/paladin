import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@paladin/shadcn"

type PromptOpts = {
  title: string
  /* hint line under the title */
  description?: string
  initial?: string
  /* select the name without its extension, like vscode */
  selectStem?: boolean
}

type ConfirmOpts = {
  title: string
  description?: string
  /* label for the confirm button */
  action?: string
}

type Request =
  | { kind: "prompt", opts: PromptOpts, resolve: (v: string | null) => void }
  | { kind: "confirm", opts: ConfirmOpts, resolve: (v: boolean) => void }

const useDialogs = create<{ req: Request | null }>(() => ({ req: null }))

function cancel(req: Request | null) {
  if (req?.kind === "prompt") req.resolve(null)
  else if (req?.kind === "confirm") req.resolve(false)
}

/* wait until any open menu (ie the context menu that launched this) has fully animated out */
function whenMenusClosed(fn: () => void, deadline = performance.now() + 800) {
  if (!document.querySelector('[role="menu"]') || performance.now() > deadline) return fn()
  requestAnimationFrame(() => whenMenusClosed(fn, deadline))
}

function open(req: Request) {
  whenMenusClosed(() => {
    cancel(useDialogs.getState().req)
    useDialogs.setState({ req })
  })
}

export const dialog = {
  prompt: (opts: PromptOpts) => new Promise<string | null>((resolve) => open({ kind: "prompt", opts, resolve })),
  confirm: (opts: ConfirmOpts) => new Promise<boolean>((resolve) => open({ kind: "confirm", opts, resolve })),
}

function close() {
  useDialogs.setState({ req: null })
}

export function Dialogs() {
  const req = useDialogs((s) => s.req)
  if (req?.kind === "prompt") return <PromptDialog key={req.opts.title} opts={req.opts} resolve={req.resolve} />
  if (req?.kind === "confirm") return <ConfirmDialog opts={req.opts} resolve={req.resolve} />
  return null
}

function PromptDialog({ opts, resolve }: { opts: PromptOpts, resolve: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.initial ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const dot = opts.selectStem ? value.lastIndexOf(".") : -1
    el.setSelectionRange(0, dot > 0 ? dot : value.length)
  }, [])

  const finish = (v: string | null) => {
    resolve(v)
    close()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && finish(null)}>
      <DialogContent className="sm:max-w-md" initialFocus={inputRef}>
        <DialogHeader>
          <DialogTitle>{opts.title}</DialogTitle>
          {opts.description && <DialogDescription>{opts.description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            finish(value)
          }}
        >
          <Input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDialog({ opts, resolve }: { opts: ConfirmOpts, resolve: (v: boolean) => void }) {
  const finish = (v: boolean) => {
    resolve(v)
    close()
  }
  return (
    <AlertDialog open onOpenChange={(open) => !open && finish(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts.title}</AlertDialogTitle>
          {opts.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)}>{opts.action ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
