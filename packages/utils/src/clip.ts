import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const SCRATCH_PATH = join(homedir(), 'scratch', 'temp-content.txt')

function open(url: string) {
  Bun.spawn(['python3', '-c', `import webbrowser; webbrowser.open('${url}')`])
}

function looksLikeUrl(text: string) {
  return text.length < 100 && !text.includes('\n') && /\.[a-z]{2,}(\/\S*)?$/i.test(text)
}

/** Opens `content` in the browser. A short single-line string with a file/domain extension (<100 chars) is opened as-is; anything else is stringified (JSON.stringify if not already a string) and written to a scratch file that's then opened as file://. Returns the URL/path opened. */
export async function clip(content: unknown) {
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  const trimmed = text.trim()
  if (looksLikeUrl(trimmed)) {
    open(trimmed)
    return trimmed
  }
  await mkdir(join(homedir(), 'scratch'), { recursive: true })
  await writeFile(SCRATCH_PATH, text, 'utf-8')
  open(`file://${SCRATCH_PATH}`)
  return SCRATCH_PATH
}
