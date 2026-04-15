// src/components/FileViewer/utils.ts

import { getEditorDisplayName } from '@/lib/getDisplayName'

interface MarkedFile {
  path: string
  notes: string[]
}

export function buildExportPayload(marked: MarkedFile[]): string {
  const files = marked
    .map(f => `// ${getEditorDisplayName(f.path)}\n(file content placeholder)`)
    .join('\n\n')

  const notes = marked
    .filter(f => f.notes.length > 0)
    .map(f => `${getEditorDisplayName(f.path)}\n${f.notes.map(n => `  - ${n}`).join('\n')}`)
    .join('\n\n')

  return files + (notes ? '\n\n---\n\n' + notes : '')
}

export function copyToClipboard(text: string) {
  // prefer async clipboard API, fall back to execCommand
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => execCommandCopy(text))
  } else {
    execCommandCopy(text)
  }
}

function execCommandCopy(text: string) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch {
    // silently fail
  }
}
