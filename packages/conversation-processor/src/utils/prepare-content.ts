// @paladin/conversation-processor/utils/prepare-content.ts

export function prepareContent(content: string, relativePath: string): string {
  if (relativePath.endsWith(".json")) {
    return stripHeader(content)
  }
  return content
}

function stripHeader(content: string): string {
  const lines = content.split("\n")
  if (lines[0]?.startsWith("//")) {
    return lines.slice(1).join("\n").trimStart()
  }
  return content
}
