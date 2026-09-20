import { useEffect, useRef } from 'react'

/* a ref that always holds the most recent render's value. lets effects read
   fresh callbacks without re-subscribing every render. */
export const useLatest = <T,>(value: T) => {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
