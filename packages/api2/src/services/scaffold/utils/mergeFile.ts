/** Appends new content onto the current file content, separated by a newline. */
export function mergeFile(current: string, addition: string): string {
  if (!current) return addition
  const separator = current.endsWith('\n') ? '' : '\n'
  return current + separator + addition
}
