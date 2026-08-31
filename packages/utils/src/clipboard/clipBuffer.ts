import { clip } from './clip'

export type ClipBufferFormat = (items: unknown[]) => string

export interface ClipBufferOptions {
  /** ms of silence before emitting. default 2000 */
  wait?: number
  /** force an emit this long after the first push, even if calls keep coming. 0 = never. default 0 */
  maxWait?: number
  /** joiner for the default formatter. default '\n' */
  separator?: string
  /** override the whole rendering step */
  format?: ClipBufferFormat
  /** where the rendered text goes. default clip */
  sink?: (text: string) => unknown
}

export interface ClipBuffer {
  (...items: unknown[]): void
  /** emit now, cancelling pending timers. no-op when empty */
  flush: () => void
  /** drop everything pending without emitting */
  reset: () => void
  /** current buffer contents */
  peek: () => unknown[]
  size: () => number
}

const stringify = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (v instanceof Error) return v.stack ?? v.message
  if (v === undefined) return 'undefined'
  try {
    return JSON.stringify(v, null, 2) ?? String(v)
  } catch {
    return String(v)
  }
}

export const createClipBuffer = (options: ClipBufferOptions = {}): ClipBuffer => {
  const {
    wait = 2000,
    maxWait = 0,
    separator = '\n',
    format = (items: unknown[]) => items.map(stringify).join(separator),
    sink = clip,
  } = options

  let buffer: unknown[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null

  /** back to a virgin state: empty buffer, no live timers */
  const reset = () => {
    if (timer) clearTimeout(timer)
    if (maxTimer) clearTimeout(maxTimer)
    timer = null
    maxTimer = null
    buffer = []
  }

  const flush = () => {
    const items = buffer
    reset()
    if (!items.length) return
    sink(format(items))
  }

  const push = (...items: unknown[]) => {
    if (!items.length) return
    buffer.push(...items)
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, wait)
    if (maxWait > 0 && !maxTimer) maxTimer = setTimeout(flush, maxWait)
  }

  return Object.assign(push, {
    flush,
    reset,
    peek: () => [...buffer],
    size: () => buffer.length,
  })
}

/**
 * Ready-to-use shared buffer. Call it like console.log from anywhere;
 * everything pushed within the debounce window lands on the clipboard
 * as one blob, then the buffer resets so the next burst starts clean.
 *
 * clipBuffer('first')
 * clipBuffer({ some: 'object' })
 * // ~2s later: clipboard holds both, buffer is empty again
 */
export const clipBuffer = createClipBuffer()
