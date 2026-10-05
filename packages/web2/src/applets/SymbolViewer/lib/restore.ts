import { useLayoutEffect, useRef } from "react"
import { useWorkspace, type FocusPane } from "../store"

export type ScrollMemoryOpts = {
  /* the scrolling element */
  getEl: () => HTMLElement | null | undefined
  /* which persisted map to use */
  bucket: "scroll" | "treeScroll"
  /* file path or package root. null disables */
  key: string | null
  /* content has rendered, so scrollHeight is real */
  ready: boolean
  /* skip restoring this time, ie a scroll target will position the view */
  skipRestore?: boolean
}

/* restores scrollTop when content is ready, and saves it (debounced, plus on pagehide) as the user scrolls */
export function useScrollMemory({ getEl, bucket, key, ready, skipRestore }: ScrollMemoryOpts) {
  useLayoutEffect(() => {
    const el = getEl()
    if (!el || !key || !ready) return
    const { setScroll } = useWorkspace.getState()
    if (!skipRestore) el.scrollTop = useWorkspace.getState()[bucket][key] ?? 0

    let last = el.scrollTop
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => setScroll(bucket, key, last)
    const onScroll = () => {
      last = el.scrollTop
      clearTimeout(timer)
      timer = setTimeout(save, 150)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pagehide", save)
    return () => {
      clearTimeout(timer)
      save()
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("pagehide", save)
    }
  }, [key, ready, bucket])
}

const refocused = new Set<FocusPane>()

/* once per page load, focus the pane that had focus before the refresh */
export function useRestoreFocus(pane: FocusPane, ready: boolean, getEl: () => HTMLElement | null | undefined) {
  const done = useRef(false)
  useLayoutEffect(() => {
    if (done.current || !ready) return
    done.current = true
    if (refocused.has(pane) || useWorkspace.getState().focus !== pane) return
    refocused.add(pane)
    getEl()?.focus({ preventScroll: true })
  }, [ready])
}
