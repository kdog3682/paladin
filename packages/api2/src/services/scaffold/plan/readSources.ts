import { expandHome } from '@paladin/utils'


const HEADER = /^\s*(?:\/\/|#|\/\*+)\s*(@?[\w.-]+(?:\/[\w.-]+)+\.\w+)\s*(?:\*+\/)?\s*$/

function looksLikePath(input: string): boolean {
  return !input.includes('\n') && input.length < 4096
}

function splitSources(input: string): string[] {
  const chunks: string[] = []
  let current: string[] | null = null

  for (const line of input.split('\n')) {
    if (HEADER.test(line)) {
      if (current) chunks.push(current.join('\n').trim())
      current = [line.trim()]
      continue
    }

    current?.push(line)
  }

  if (current) chunks.push(current.join('\n').trim())

  return chunks.filter(Boolean)
}

export async function readSources(input: string | string[]): Promise<string[]> {
  if (Array.isArray(input)) {
    return (await Promise.all(input.map(readSources))).flat()
  }
  if (!looksLikePath(input)) {
    return splitSources(input)
  }
  const expanded = expandHome(input)

  if (expanded.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = new Uint8Array(await Bun.file(expanded).arrayBuffer())
    const entries = unzipSync(buf)
    return Object.values(entries).map((u8) => strFromU8(u8))
  }

  return [await Bun.file(expanded).text()]
}
