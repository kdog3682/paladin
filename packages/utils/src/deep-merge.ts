// @paladin/utils/deep-merge.ts

export function deepMergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMergeInto(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>
      )
    } else {
      target[key] = value
    }
  }
}

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base }

  for (const [key, value] of Object.entries(overlay)) {
    if (!(key in result)) {
      result[key] = value
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      )
    }
  }

  return result
}
