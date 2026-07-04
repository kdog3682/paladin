import { useEffect, useState } from 'react'
import { cn } from '@bklearn/shadcn'
import type { BundledLanguage } from 'shiki'
import { highlight, type Run } from './highlight'
import { Clipboard } from '@paladin/ui/Clipboard'
import type { Clickable } from './clickables'

export interface ClickableCodeBlockProps {
  code: string
  lang?: BundledLanguage
  theme?: string
  filename?: string
  showLineNumbers?: boolean
  /** Wrap long lines instead of horizontal-scrolling. Default true. */
  wrapCode?: boolean
  onSymbolClick?: (symbol: string, source: string) => void
  onSourceClick?: (source: string) => void
  className?: string
}

export function ClickableCodeBlock({
  code,
  lang = 'tsx',
  theme = 'claude',
  filename,
  showLineNumbers = false,
  wrapCode = true,
  onSymbolClick,
  onSourceClick,
  className,
}: ClickableCodeBlockProps) {
  const [state, setState] = useState<Awaited<ReturnType<typeof highlight>> | null>(null)

  useEffect(() => {
    let alive = true
    highlight(code, lang, theme)
      .then((r) => alive && setState(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [code, lang, theme])

  const fire = (c: Clickable) => {
    if (c.kind === 'symbol') onSymbolClick?.(c.value, c.source)
    else onSourceClick?.(c.source)
  }

  const styleOf = (r: Run) => ({
    color: r.color,
    fontStyle: r.italic ? ('italic' as const) : undefined,
    fontWeight: r.bold ? ('bold' as const) : undefined,
    textDecoration: r.underline ? ('underline' as const) : undefined,
  })

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border text-sm',
        className,
      )}
      style={{ background: state?.bg ?? 'transparent' }}
    >
      {filename && (
        <div className="border-b border-border/60 px-4 py-2 font-mono text-xs text-muted-foreground">
          {filename}
        </div>
      )}

      <Clipboard text={code} />

      <pre
        className={cn('p-4 leading-relaxed', wrapCode ? 'overflow-x-hidden' : 'overflow-x-auto')}
        style={{ color: state?.fg }}
      >
        <code className="grid font-mono">
          {state
            ? state.lines.map((runs, li) => (
                <span key={li} className="flex">
                  {showLineNumbers && (
                    <span className="mr-4 w-8 shrink-0 select-none text-right tabular-nums text-muted-foreground/40">
                      {li + 1}
                    </span>
                  )}
                  <span className={wrapCode ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}>
                    {runs.length === 0
                      ? '\u00a0'
                      : runs.map((r, ri) =>
                          r.click ? (
                            <button
                              key={ri}
                              type="button"
                              onClick={() => fire(r.click!)}
                              title={r.click.kind === 'symbol' ? r.click.source : undefined}
                              className="m-0 inline cursor-pointer rounded-sm border-0 bg-transparent p-0 align-baseline font-[inherit] underline decoration-dotted decoration-1 underline-offset-2 hover:bg-primary/20 hover:decoration-solid"
                              style={styleOf(r)}
                            >
                              {r.text}
                            </button>
                          ) : (
                            <span key={ri} style={styleOf(r)}>
                              {r.text}
                            </span>
                          ),
                        )}
                  </span>
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  )
}
