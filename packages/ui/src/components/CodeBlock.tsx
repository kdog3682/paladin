import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'

const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', css: 'css', html: 'html', md: 'markdown', sh: 'bash',
}

/** Maps a bare file extension to a shiki language id, falling back to 'text'. */
export function detectLanguage(ext: string) {
  return EXT_LANG_MAP[ext] ?? 'text'
}

/** Syntax-highlights `code` via shiki. `ext` selects the language through `detectLanguage`. */
export function CodeBlock({ code, ext, theme = 'github-light' }: { code: string; ext: string; theme?: string }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    codeToHtml(code, { lang: detectLanguage(ext), theme }).then((out) => {
      if (!cancelled) setHtml(out)
    })
    return () => {
      cancelled = true
    }
  }, [code, ext, theme])

  return <div dangerouslySetInnerHTML={{ __html: html }} className="text-sm [&_pre]:p-4 [&_pre]:m-0" />
}
