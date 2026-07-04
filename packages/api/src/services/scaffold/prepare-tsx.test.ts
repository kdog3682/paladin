import { test, expect } from 'bun:test'
import { extractHeader, prepare } from './prepare'

const BASE_PROJECT_DIR = '/tmp/scaffold-tsx-test'

const OPTS = { baseProjectDir: BASE_PROJECT_DIR, git: { initLocalRepo: false, initRemoteRepository: false } }

const CODE_BLOCK_CONTENT = `// @paladin/ui/components/CodeBlock.tsx
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

/** Syntax-highlights \`code\` via shiki. \`ext\` selects the language through \`detectLanguage\`. */
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
}`

test('extractHeader pulls path and body from CodeBlock content', () => {
  const result = extractHeader(CODE_BLOCK_CONTENT)
  expect(result).not.toBeNull()
  expect(result!.rawPath).toBe('@paladin/ui/components/CodeBlock.tsx')
  expect(result!.body).toContain("import { useEffect, useState } from 'react'")
  expect(result!.body).not.toMatch(/^\/\/ @paladin/)
})

test('prepare resolves CodeBlock into paladin/ui package', () => {
  const result = prepare([CODE_BLOCK_CONTENT], OPTS)
  expect(result).not.toBeNull()
  expect(result!.name).toBe('paladin')
  expect(result!.packages).toHaveLength(1)

  const pkg = result!.packages[0]
  expect(pkg.name).toBe('ui')
  expect(pkg.files).toHaveLength(1)

  const file = pkg.files[0]
  expect(file.relpath).toBe('src/components/CodeBlock.tsx')
  expect(file.content).toContain('export function CodeBlock')
})

test('prepare returns null for content without a valid header', () => {
  const result = prepare(['no header here, just plain text'], OPTS)
  expect(result).toBeNull()
})
