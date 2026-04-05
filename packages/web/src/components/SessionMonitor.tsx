// @paladin/packages/web/src/components/SessionMonitor.tsx

import { useState, useEffect, useRef, useCallback } from "react"

// ── Types ───────────────────────────────────────────────────

interface SessionInfo {
  projectName: string
  projectDir: string
  conversationId: string
  conversationUrl: string
  conversationTitle: string
  updatedAt: string
  files: string[]
}

interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  cmd: string[]
}

interface HandlerResult {
  name: string
  file: string
  result: BashResult
}

interface WsMessage {
  event: string
  data: unknown
}

// ── Hook ────────────────────────────────────────────────────

function useFilewatch(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [results, setResults] = useState<HandlerResult[]>([])

  useEffect(() => {
    activeRef.current = true

    function connect() {
      if (!activeRef.current) return
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (evt) => {
        const msg: WsMessage = JSON.parse(evt.data)

        if (msg.event === "filewatch:session") {
          setSession(msg.data as SessionInfo)
          setPending([])
          setResults([])
        }

        if (msg.event === "filewatch:pending") {
          setPending(msg.data as string[])
          setResults([])
        }

        if (msg.event === "filewatch:results") {
          setResults(msg.data as HandlerResult[])
          setPending([])
        }
      }

      ws.onclose = () => {
        if (activeRef.current) {
          retryRef.current = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      activeRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [url])

  const rerun = useCallback((name: string, file: string) => {
    wsRef.current?.send(JSON.stringify({
      event: "filewatch:rerun",
      data: { name, file },
    }))
  }, [])

  return { session, pending, results, rerun }
}

// ── Components ──────────────────────────────────────────────

function InfoPanel({ session }: { session: SessionInfo }) {
  return (
    <div className="info-panel">
      <h2>{session.projectName}</h2>
      <div className="info-row">
        <span className="info-label">Directory</span>
        <span className="info-value">{session.projectDir}</span>
      </div>
      <div className="info-row">
        <a
          href={session.conversationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="info-link"
        >
          {session.conversationTitle}
        </a>
      </div>
      <div className="info-row">
        <span className="info-label">Updated</span>
        <span className="info-value">
          {new Date(session.updatedAt).toLocaleString()}
        </span>
      </div>
      <div className="info-files">
        <span className="info-label">Files ({session.files.length})</span>
        <ul>
          {session.files.map((f) => (
            <li key={f}>{f.split("/packages/").pop()}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function BashTestDisplay({
  item,
  onRerun,
}: {
  item: HandlerResult
  onRerun: () => void
}) {
  const passed = item.result.exitCode === 0

  const copyResults = () => {
    const text = item.result.stdout + item.result.stderr
    navigator.clipboard.writeText(text)
  }

  return (
    <div className={`result-card ${passed ? "passed" : "failed"}`}>
      <div className="result-header">
        <span className="result-badge">{passed ? "PASS" : "FAIL"}</span>
        <span className="result-file">{item.file.split("/").pop()}</span>
        <div className="result-actions">
          <button onClick={copyResults} className="btn-icon" title="Copy results">
            <CopyIcon />
          </button>
          <button onClick={onRerun} className="btn-icon" title="Re-run">
            <RefreshIcon />
          </button>
        </div>
      </div>
      <pre className="result-output">
        {item.result.stdout || item.result.stderr}
      </pre>
    </div>
  )
}

function BashDemoDisplay({
  item,
  onRerun,
}: {
  item: HandlerResult
  onRerun: () => void
}) {
  const ok = item.result.exitCode === 0

  return (
    <div className={`result-card ${ok ? "passed" : "failed"}`}>
      <div className="result-header">
        <span className="result-badge">{ok ? "OK" : "ERR"}</span>
        <span className="result-file">{item.file.split("/").pop()}</span>
        <div className="result-actions">
          <button onClick={onRerun} className="btn-icon" title="Re-run">
            <RefreshIcon />
          </button>
        </div>
      </div>
      <pre className="result-output">
        {item.result.stdout || item.result.stderr}
      </pre>
    </div>
  )
}

function ResultCard({
  item,
  onRerun,
}: {
  item: HandlerResult
  onRerun: () => void
}) {
  if (item.name === "test") {
    return <BashTestDisplay item={item} onRerun={onRerun} />
  }
  if (item.name === "demo") {
    return <BashDemoDisplay item={item} onRerun={onRerun} />
  }
  return null
}

function Spinner({ names }: { names: string[] }) {
  return (
    <div className="spinner-container">
      <div className="spinner" />
      <span>Running {names.join(", ")}...</span>
    </div>
  )
}

// ── Icons ───────────────────────────────────────────────────

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// ── Main ────────────────────────────────────────────────────

export function SessionMonitor({ wsUrl }: { wsUrl: string }) {
  const { session, pending, results, rerun } = useFilewatch(wsUrl)

  if (!session) {
    return (
      <div className="session-monitor empty">
        <span>Waiting for session...</span>
      </div>
    )
  }

  return (
    <div className="session-monitor">
      <div className="session-left">
        <InfoPanel session={session} />
      </div>
      <div className="session-right">
        {pending.length > 0 && <Spinner names={pending} />}
        {results.map((item, i) => (
          <ResultCard
            key={`${item.name}-${item.file}-${i}`}
            item={item}
            onRerun={() => rerun(item.name, item.file)}
          />
        ))}
        {!pending.length && !results.length && (
          <div className="no-results">No runnable files</div>
        )}
      </div>
    </div>
  )
}
