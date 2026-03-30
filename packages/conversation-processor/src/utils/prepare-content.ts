// @paladin/conversation-processor/utils/prepare-content.ts

export function prepareContent(content: string, relativePath: string): string {
  if (relativePath.endsWith(".json")) {
    return stripHeader(content)
  }
  return content
}

function stripHeader(content: string): string {
  const lines = content.split("\n")

  let index = 0
  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (!trimmed || trimmed.startsWith("#!")) {
      index += 1
      continue
    }

    const isCommentLine = (
      trimmed.startsWith("//")
      || /^#(?!!)(?:#*)\s+/.test(trimmed)
      || /^<!--\s*.+?\s*-->$/.test(trimmed)
    )

    if (!isCommentLine) break
    index += 1
  }

  return lines.slice(index).join("\n").trimStart()
}
