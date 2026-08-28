type Plain = Record<string, unknown>

export function isPlainObject(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Merges `patch` into `base`, recursing through plain objects. Arrays and
 * primitives are replaced wholesale; an explicit `undefined` drops the key.
 */
export function deepMerge<T extends Plain>(base: T, patch: Plain): T {
  const out: Plain = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    if (isPlainObject(current) && isPlainObject(value)) out[key] = deepMerge(current, value)
    else if (value === undefined) delete out[key]
    else out[key] = value
  }

  return out as T
}
