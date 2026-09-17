/** Words: acronym runs, capitalised or lowercase words, lone capitals, digit runs. */
const WORD = /[A-Z]+(?![a-z])|[A-Z]?[a-z\d]+|[A-Z]|\d+/g

/**
 * Convert a string to PascalCase. Handles acronym runs, so `HTTPClient`
 * becomes `HttpClient` and `api-index_file` becomes `ApiIndexFile`.
 */
export function pascalCase(value: string): string {
  const words = value.match(WORD) ?? []
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join("")
}
