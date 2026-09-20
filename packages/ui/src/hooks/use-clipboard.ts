import { useCallback, useEffect, useRef, useState } from 'react'

export type UseClipboardOpts = {
  /* ms before `copied` falls back to false. defaults to 1500 */
  resetAfter?: number
}

export const useClipboard = ({ resetAfter = 1500 }: UseClipboardOpts = {}) => {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetAfter)
        return true
      } catch {
        setCopied(false)
        return false
      }
    },
    [resetAfter],
  )

  return { copied, copy }
}
