import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { codeToHtml } from 'shiki'
import { Folder } from 'lucide-react'
import { cn } from '@bklearn/shadcn'

const BACKEND_PORT = 3000
const API = `http://localhost:${BACKEND_PORT}/simple-project-viewer`
const PKG_STORAGE_KEY = 'simple-project-viewer:pkgPath'

// GitHub light palette.
const BG = '#ffffff'
const FG = '#24292f'
const MUTED = '#57606a'
const BORDER = '#d0d7de'
const ACCENT = '#0969da'
const ACCENT_BG = '#ddf4ff'
const MARK_COLOR = '#1a7f37'

function langFromExt(ext: string) {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', css: 'css', html: 'html', md: 'markdown', sh: 'bash',
  }
  return map[ext] ?? 'text'
}

async function safeJson(res: Response) {
  const text = await res.text()
  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${res.url}:`, text)
    throw new Error(`HTTP ${res.status} from ${res.url}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    console.error(`non-JSON response from ${res.url}:`, text)
    throw new Error(`non-JSON response from ${res.url} — see console`)
  }
}

// --- file tree -------------------------------------------------------

type TreeNode =
  | { type: 'file'; name: string; path: string }
  | { type: 'dir'; name: string; path: string; children: TreeNode[] }

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const filePath of paths) {
    const parts = filePath.split('/')
    let level = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      const isFile = i === parts.length - 1
      let node = level.find((n) => n.name === part && n.type === (isFile ? 'file' : 'dir'))
      if (!node) {
        node = isFile
          ? { type: 'file', name: part, path: acc }
          : { type: 'dir', name: part, path: acc, children: [] }
        level.push(node)
      }
      if (node.type === 'dir') level = node.children
    })
  }
  const sortLevel = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
    for (const n of nodes) if (n.type === 'dir') sortLevel(n.children)
  }
  sortLevel(root)
  return root
}

function flattenFiles(nodes: TreeNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'file') out.push(n.path)
    else out.push(...flattenFiles(n.children))
  }
  return out
}

// Flatten to the currently visible rows (respecting collapsed dirs), in display order.
function flattenVisible(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'dir' && !collapsed.has(n.path)) {
      out.push(...flattenVisible(n.children, collapsed))
    }
  }
  return out
}

function depthOf(path: string) {
  return path.split('/').length - 1
}

function TreeView({
  nodes,
  depth,
  focused,
  openFile,
  marks,
  collapsed,
  onFocus,
}: {
  nodes: TreeNode[]
  depth: number
  focused: string | null
  openFile: string | null
  marks: Set<string>
  collapsed: Set<string>
  onFocus: (path: string) => void
}) {
  return (
    <>
      {nodes.map((n) => {
        const isFocused = n.path === focused
        if (n.type === 'dir') {
          const isCollapsed = collapsed.has(n.path)
          return (
            <div key={n.path}>
              <div
                onClick={() => onFocus(n.path)}
                style={{
                  paddingLeft: 8 + depth * 12,
                  color: MUTED,
                  backgroundColor: isFocused ? ACCENT_BG : 'transparent',
                }}
                className="px-2 py-1 text-sm cursor-pointer select-none flex items-center gap-1.5 hover:opacity-80"
              >
                <span className="w-4 inline-block text-base leading-none">{isCollapsed ? '▸' : '▾'}</span>
                <Folder size={14} style={{ color: MUTED }} />
                <span className="truncate font-medium">{n.name}</span>
              </div>
              {!isCollapsed && (
                <TreeView
                  nodes={n.children}
                  depth={depth + 1}
                  focused={focused}
                  openFile={openFile}
                  marks={marks}
                  collapsed={collapsed}
                  onFocus={onFocus}
                />
              )}
            </div>
          )
        }
        const isMarked = marks.has(n.path)
        return (
          <div
            key={n.path}
            onClick={() => onFocus(n.path)}
            style={{
              paddingLeft: 24 + depth * 12,
              backgroundColor: isFocused ? ACCENT_BG : 'transparent',
              color: isMarked ? MARK_COLOR : FG,
            }}
            className="px-2 py-1 text-sm cursor-pointer truncate"
          >
            <span className="truncate">{n.name}</span>
          </div>
        )
      })}
    </>
  )
}

// --- app ---------------------------------------------------------------

export default function App() {
  const [pkgPath, setPkgPath] = useState(() => localStorage.getItem(PKG_STORAGE_KEY) ?? '')
  const [editingPkg, setEditingPkg] = useState(false)
  const [pkgInput, setPkgInput] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [focused, setFocused] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [html, setHtml] = useState('')
  const [marks, setMarks] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [project, pkg] = pkgPath.split('/')

  const tree = useMemo(() => buildTree(files), [files])
  const fileSet = useMemo(() => new Set(flattenFiles(tree)), [tree])
  const visible = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])

  const loadTree = useCallback(async (p: string) => {
    const [project, pkg] = p.split('/')
    if (!project || !pkg) return
    setError(null)
    try {
      const data = await safeJson(await fetch(`${API}/tree?project=${project}&pkg=${pkg}`))
      const fileList: string[] = data.files ?? []
      setFiles(fileList)
      const firstTree = buildTree(fileList)
      const firstVisible = flattenVisible(firstTree, new Set())
      setFocused(firstVisible[0]?.path ?? null)
      setSelected(flattenFiles(firstTree)[0] ?? null)
      const marksData = await safeJson(await fetch(`${API}/marks?project=${project}&pkg=${pkg}`))
      setMarks(new Set(marksData.marks ?? []))
    } catch (err) {
      setError((err as Error).message)
      setFiles([])
      setFocused(null)
      setSelected(null)
    }
  }, [])

  useEffect(() => {
    if (editingPkg) inputRef.current?.focus()
  }, [editingPkg])

  useEffect(() => {
    if (pkgPath) {
      localStorage.setItem(PKG_STORAGE_KEY, pkgPath)
      loadTree(pkgPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkgPath])

  // Moving focus onto a file opens it in the code panel.
  useEffect(() => {
    if (focused && fileSet.has(focused)) setSelected(focused)
  }, [focused, fileSet])

  useEffect(() => {
    if (!selected || !project || !pkg) return
    ;(async () => {
      try {
        const res = await fetch(`${API}/file?project=${project}&pkg=${pkg}&path=${encodeURIComponent(selected)}`)
        const data = await safeJson(res)
        const out = await codeToHtml(data.content ?? '', {
          lang: langFromExt(data.ext ?? ''),
          theme: 'github-light',
        })
        setHtml(out)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [selected, project, pkg])

  const toggleMark = useCallback(
    async (path: string) => {
      if (!project || !pkg) return
      try {
        const res = await fetch(`${API}/marks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, pkg, path }),
        })
        const data = await safeJson(res)
        setMarks(new Set(data.marks ?? []))
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [project, pkg],
  )

  const exportMarked = useCallback(async () => {
    if (!project || !pkg || marks.size === 0) return
    try {
      const res = await fetch(`${API}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, pkg, paths: [...marks] }),
      })
      const data = await safeJson(res)
      setStatus(`opened ${data.count} file(s) → ${data.path}`)
      setMarks(new Set())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [project, pkg, marks])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editingPkg) {
        if (e.key === 'Enter') {
          setPkgPath(pkgInput)
          setEditingPkg(false)
        }
        if (e.key === 'Escape') setEditingPkg(false)
        return
      }
      if (e.key === 'p') {
        e.preventDefault()
        setPkgInput(pkgPath)
        setEditingPkg(true)
        return
      }
      if (e.key === 'e') {
        e.preventDefault()
        exportMarked()
        return
      }
      if (!visible.length || !focused) return
      const idx = visible.findIndex((n) => n.path === focused)
      const node = visible[idx]

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocused(visible[(idx + 1) % visible.length].path)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocused(visible[(idx - 1 + visible.length) % visible.length].path)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (node.type === 'dir' && collapsed.has(node.path)) {
          setCollapsed((prev) => {
            const next = new Set(prev)
            next.delete(node.path)
            return next
          })
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (node.type === 'dir' && !collapsed.has(node.path)) {
          setCollapsed((prev) => new Set(prev).add(node.path))
        }
      } else if (e.key === 'm') {
        e.preventDefault()
        if (node.type === 'file') toggleMark(node.path)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingPkg, pkgInput, pkgPath, visible, focused, collapsed, loadTree, toggleMark, exportMarked])

  return (
    <div className="flex h-screen" style={{ backgroundColor: BG, color: FG }}>
      <div className="w-72 flex flex-col" style={{ borderRight: `1px solid ${BORDER}` }}>
        <div className="p-2 text-xs" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED }}>
          {editingPkg ? (
            <div className="flex items-center gap-0.5">
              <span>@</span>
              <input
                ref={inputRef}
                value={pkgInput}
                onChange={(e) => setPkgInput(e.target.value)}
                placeholder="project/pkg"
                style={{ borderColor: BORDER, color: FG }}
                className="w-full bg-transparent outline-none border rounded px-1 py-0.5"
              />
            </div>
          ) : (
            <span>{pkgPath ? `@${pkgPath}` : 'press p to set project/pkg'}</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <TreeView
            nodes={tree}
            depth={0}
            focused={focused}
            openFile={selected}
            marks={marks}
            collapsed={collapsed}
            onFocus={setFocused}
          />
        </div>
        {(error || status) && (
          <div
            className="p-2 text-[10px] break-words"
            style={{ borderTop: `1px solid ${BORDER}`, color: error ? '#cf222e' : MUTED }}
          >
            {error ?? status}
          </div>
        )}
        <div className="p-2 text-[10px]" style={{ borderTop: `1px solid ${BORDER}`, color: MUTED }}>
          p: set pkg · ↑↓: move · ←→: collapse/expand · m: mark · e: export marked
        </div>
      </div>
      <div className="flex-1 overflow-auto" style={{ backgroundColor: BG }}>
        <div
          dangerouslySetInnerHTML={{ __html: html }}
          className="text-sm [&_pre]:p-4 [&_pre]:m-0"
        />
      </div>
    </div>
  )
}
