import { EditorView } from '@codemirror/view'
import { cn } from '@bklearn/shadcn'
import { useEditor } from '../hooks/useEditor'

interface EditorProps {
  onNew?: (view: EditorView) => void
  onOpen?: (view: EditorView) => void
  onSave?: (docJson: unknown, foldsJson: unknown) => void
  className?: string
}

export function Editor({ onNew, onOpen, onSave, className }: EditorProps) {
  const { containerRef } = useEditor({ onNew, onOpen, onSave })

  return <div ref={containerRef} className={cn('h-full w-full', className)} />
}
