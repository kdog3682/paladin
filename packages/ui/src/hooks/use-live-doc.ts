import { useEffect } from 'react'
import type { EditorView } from '@codemirror/view'
import { useLatest } from './use-latest'

export type UseLiveDocOpts = {
  /* ms to coalesce edits before reporting. defaults to 250 */
  throttle?: number
}

/* reports the editor's text as it is typed, for anything that needs the doc
   sooner than the debounced onSave — sidebar titles, search, opt+c.
   flushes once more on unmount so a file switch never drops the last keystroke. */
export const useLiveDoc = (
  view: EditorView | null | undefined,
  onChange: (doc: string) => void,
  opts: UseLiveDocOpts = {},
) => {
  const { throttle = 250 } = opts
  const latest = useLatest(onChange)

  useEffect(() => {
    if (!view) return
    let last = view.state.doc.toString()
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      timer = null
      const next = view.state.doc.toString()
      if (next === last) return
      last = next
      latest.current(next)
    }
    const schedule = () => {
      if (timer == null) timer = setTimeout(flush, throttle)
    }

    const events = ['input', 'keyup', 'cut', 'paste', 'drop'] as const
    events.forEach(type => view.dom.addEventListener(type, schedule))
    return () => {
      events.forEach(type => view.dom.removeEventListener(type, schedule))
      if (timer != null) clearTimeout(timer)
      flush()
    }
  }, [view, throttle, latest])
}
