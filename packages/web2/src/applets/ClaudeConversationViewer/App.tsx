import { useEffect, useMemo, useState } from "react"
import "./index.css"
import { listSessions, loadSession, type Session, type SessionInfo, type ToolResultBlock } from "./lib/api"
import { TurnView } from "./components/TurnView"
import { OpenAll } from "./components/Truncated"

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 60 / 24)}d ago`
}

/* -home-me-projects-paladin-packages-keydraw -> @paladin/keydraw */
const projectName = (p: string) => {
  const name = p.replace(/^-home-[^-]+-(projects-)?/, "")
  const [scope, pkg] = name.split("-packages-")
  return pkg ? `@${scope}/${pkg}` : name
}

const LIMIT = 10

const hashOf = () => decodeURIComponent(location.hash.slice(1))

/** claude code transcripts from ~/.claude/projects, served by api2 */
export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selected, setSelected] = useState(hashOf())
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [project, setProject] = useState<string | null>(null)
  const [all, setAll] = useState({ open: false, n: 0 })

  useEffect(() => {
    listSessions().then(setSessions, (e) => setError(String(e.message ?? e)))
  }, [])

  useEffect(() => {
    const onHash = () => setSelected(hashOf())
    addEventListener("hashchange", onHash)
    return () => removeEventListener("hashchange", onHash)
  }, [])

  useEffect(() => {
    const [project, id] = selected.split("/")
    if (!project || !id) return setSession(null)
    setSession(null)
    loadSession(project, id).then(setSession, (e) => setError(String(e.message ?? e)))
  }, [selected])

  // sessions arrive newest first, so the first of each project is its most recent
  const projects = useMemo(() => [...new Set(sessions.map((s) => s.project))], [sessions])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => !project || s.project === project)
      .filter((s) => !q || `${s.title ?? ""} ${s.firstPrompt ?? ""} ${projectName(s.project)}`.toLowerCase().includes(q))
      .slice(0, LIMIT)
  }, [sessions, query, project])

  const results = useMemo(() => {
    const map = new Map<string, ToolResultBlock>()
    for (const t of session?.turns ?? [])
      for (const b of t.blocks) if (b.type === "tool_result") map.set(b.toolUseId, b)
    return map
  }, [session])

  // a user turn that only carries tool results is shown inside the tool calls
  const turns = useMemo(
    () => (session?.turns ?? []).filter((t) => t.blocks.some((b) => b.type !== "tool_result")),
    [session],
  )

  return (
    <div className="flex h-screen bg-white text-neutral-900">
      <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-200">
        <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 p-3 pb-2">
          <button
            onClick={() => setAll({ open: !all.open, n: all.n + 1 })}
            className="rounded border border-neutral-300 bg-neutral-900 px-2 py-0.5 text-xs text-white hover:bg-neutral-700"
          >
            {all.open ? "close commands" : "open commands"}
          </button>
          {[null, ...projects].map((p) => (
            <button
              key={p ?? "all"}
              onClick={() => setProject(p)}
              className={`rounded border px-2 py-0.5 text-xs ${
                project === p ? "border-neutral-900 bg-neutral-100" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"
              }`}
            >
              {p ? projectName(p) : "all"}
            </button>
          ))}
        </div>
        <div className="border-b border-neutral-200 p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter conversations"
            spellCheck={false}
            className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((s) => {
            const key = `${s.project}/${s.id}`
            return (
              <li key={key}>
                <a
                  href={`#${key}`}
                  className={`block border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50 ${key === selected ? "bg-neutral-100" : ""}`}
                >
                  <div className="truncate text-sm">{s.title ?? s.firstPrompt ?? s.id}</div>
                  <div className="truncate text-[11px] text-neutral-400">
                    {projectName(s.project)} · {ago(s.modified)} · {Math.round(s.size / 1024)}KB
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {error && <div className="p-4 text-sm text-red-600">{error}</div>}
        {!session && !error && selected && <div className="p-4 text-sm text-neutral-400">loading…</div>}
        {!selected && <div className="p-4 text-sm text-neutral-400">pick a conversation</div>}
        {session && (
          <OpenAll.Provider value={all}>
          <div className="mx-auto max-w-4xl space-y-4 p-6">
            <h1 className="font-mono text-sm text-neutral-500">{session.title ?? session.id}</h1>
            {turns.map((t) => (
              <TurnView key={t.uuid} turn={t} results={results} />
            ))}
          </div>
          </OpenAll.Provider>
        )}
      </main>
    </div>
  )
}
