function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Walks arrays and plain objects, applying `fn` to every leaf value. */
export function deepMap<T>(value: T, fn: (leaf: unknown) => unknown): T {
  if (Array.isArray(value)) return value.map((item) => deepMap(item, fn)) as unknown as T

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = deepMap(item, fn)
    return out as T
  }

  return fn(value) as T
}
