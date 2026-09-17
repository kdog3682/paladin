import { pascalCase } from "./pascalCase"

/**
 * Convert a string to camelCase. Handles acronym runs, so `HTTPClient`
 * becomes `httpClient` and `api-index_file` becomes `apiIndexFile`.
 */
export function camelCase(value: string): string {
  const pascal = pascalCase(value)
  if (pascal.length === 0) return pascal
  return pascal[0]!.toLowerCase() + pascal.slice(1)
}
