import type { MochiFile, MochiStory } from "./types"

export function transform(file: MochiFile, imports: string): string {
  const lines: string[] = []
  if (imports) lines.push(imports, "")

  for (let si = 0; si < file.sections.length; si++) {
    const section = file.sections[si]
    for (let sti = 0; sti < section.stories.length; sti++) {
      lines.push(storyFn(`_s${si}_${sti}`, section.stories[sti]))
    }
  }

  return lines.join("\n")
}

function storyFn(name: string, story: MochiStory): string {
  const body: string[] = []

  for (const decl of story.context) {
    body.push(`  ${decl}`)
  }

  for (let i = 0; i < story.calls.length; i++) {
    const call = story.calls[i]
    const isLast = i === story.calls.length - 1
    body.push(isLast ? `  return ${call.source}` : `  ${call.source}`)
  }

  return `export async function ${name}() {\n${body.join("\n")}\n}\n`
}
