import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { openInBrowser } from './openInBrowser'

const SCRATCH_PATH = join(homedir(), 'trash', 'scratch.temp.content.txt')

function looksLikeUrl(text: string) {
  return text.length < 100 && !text.includes('\n') && /\.[a-z]{2,}(\/\S*)?$/i.test(text)
}

function stringify(content: unknown) {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2)
}

/** Opens `contents` in the browser. Multiple args are joined with a `\n\n---\n\n` separator. A single short single-line string with a file/domain extension (<100 chars) is opened as-is; anything else is stringified (JSON.stringify if not already a string) and written to a scratch file that's then opened as file://. Returns the URL/path opened. */
export async function clip(...contents: unknown[]) {
  const text = contents.map(stringify).join('\n\n---\n\n')
  const trimmed = text.trim()
  if (trimmed === '') return

  if (looksLikeUrl(trimmed)) {
    openInBrowser(trimmed)
    return trimmed
  }

  await mkdir(join(homedir(), 'scratch'), { recursive: true })
  await writeFile(SCRATCH_PATH, text, 'utf-8')
  openInBrowser(`file://${SCRATCH_PATH}`)
  return SCRATCH_PATH
}
