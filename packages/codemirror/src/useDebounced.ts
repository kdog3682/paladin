import { useRef } from 'react'

/**
 * Keeps a ref pointed at the latest render's value.
 *
 * Effects and callbacks that are created once (mount-only effects, debounced
 * functions) otherwise close over the first render's props forever.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export type Debounced = {
  /** Start or restart the timer. */
  run: () => void
  /** Fire now if a call is pending; no-op otherwise. */
  flush: () => void
  /** Drop a pending call without firing it. */
  cancel: () => void
}

/**
 * Debounces `fn`. Both `fn` and `delay` are read when the timer fires, so a
 * caller can pass an inline arrow and change the delay at runtime.
 *
 * The returned object is stable for the component's lifetime, so it's safe to
 * capture inside a mount-only effect.
 */
export function useDebounced(fn: () => void, delay: number): Debounced {
  const fnRef = useLatest(fn)
  const delayRef = useLatest(delay)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const api = useRef<Debounced | null>(null)

  if (!api.current) {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    api.current = {
      run() {
        cancel()
        timer.current = setTimeout(() => {
          timer.current = null
          fnRef.current()
        }, delayRef.current)
      },
      flush() {
        if (!timer.current) return
        cancel()
        fnRef.current()
      },
      cancel,
    }
  }

  return api.current
}
