import { useAppStore } from './store'

export function DocContext() {
  const docProject = useAppStore((s) => s.docProject)
  const docTitle = useAppStore((s) => s.docTitle)

  return (
    <div className="flex h-7 items-center border-t bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
      @{docProject}/{docTitle}
    </div>
  )
}
