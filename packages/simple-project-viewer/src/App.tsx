import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createApiClient } from '@paladin/utils/api'
import { TreeView, TreeNode, buildTree, flattenFiles, flattenVisible } from '@paladin/ui/TreeView'
import { CodeBlock } from '@paladin/ui/CodeBlock'

const apiClient = createApiClient('simple-project-viewer')
const PKG_STORAGE_KEY = 'simple-project-viewer:pkgPath'

// GitHub light palette.
const BG = '#ffffff'
const FG = '#24292f'
const MUTED = '#57606a'
const BORDER = '#d0d7de'
const ACCENT_BG = '#ddf4ff'
const MARK_COLOR = '#1a7f37'

const treeColors = { muted: MUTED, accentBg: ACCENT_BG, fg: FG, markColor: MARK_COLOR }

export default function App() {
  const [pkgPath, setPkgPath] = useState(() => localStorage.getItem(PKG_STORAGE_KEY) ?? '')
  const [editingPkg, setEditingPkg] = useState(false)
  const [pkgInput, setPkgInput] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [focused, setFocused] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<{ content: string; ext: string } | null>(null)
  const [marks, setMarks] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Map<string, string>>(new Map())
  const [editingNote, setEditingNote] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const [project, pkg] = pkgPath.split('/')

  const tree = useMemo(() => buildTree(files), [files])
  const fileSet = useMemo(() => new Set(flattenFiles(tree)), [tree])
  const visible = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])

  const loadTree = useCallback(async (p: string) => {
    const [project, pkg] = p.split('/')
    if (!project || !pkg) return
    setError(null)
    try {
      const { files: fileList } = await apiClient.call('simple-project-viewer.tree', { project, pkg })
      setFiles(fileList)
      const firstTree = buildTree(fileList)
      const firstVisible = flattenVisible(firstTree, new Set())
      setFocused(firstVisible[0]?.path ?? null)
      setSelected(flattenFiles(firstTree)[0] ?? null)
      const { marks: markList } = await apiClient.call('simple-project-viewer.marks.list', { project, pkg })
      setMarks(new Set(markList))
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
    if (editingNote) noteRef.current?.focus()
  }, [editingNote])

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
        const data = await apiClient.call('simple-project-viewer.file', { project, pkg, path: selected })
        setFileContent(data)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [selected, project, pkg])

  const toggleMarkDir = useCallback(
    async (node: TreeNode & { type: 'dir' }) => {
      if (!project || !pkg) return
      const filePaths = flattenFiles([node])
      if (!filePaths.length) return
      const allMarked = filePaths.every((p) => marks.has(p))
      const newMarks = new Set(marks)
      const toToggle = filePaths.filter((p) => (allMarked ? marks.has(p) : !marks.has(p)))
      for (const p of filePaths) allMarked ? newMarks.delete(p) : newMarks.add(p)
      setMarks(newMarks)
      try {
        await Promise.all(
          toToggle.map((p) => apiClient.call('simple-project-viewer.marks.toggle', { project, pkg, path: p })),
        )
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [project, pkg, marks],
  )

  const toggleMark = useCallback(
    async (path: string) => {
      if (!project || !pkg) return
      try {
        const { marks: markList } = await apiClient.call('simple-project-viewer.marks.toggle', { project, pkg, path })
        setMarks(new Set(markList))
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [project, pkg],
  )

  const exportMarked = useCallback(async () => {
    if (!project || !pkg || marks.size === 0) return
    try {
      const notesRecord: Record<string, string> = {}
      for (const [path, note] of notes) {
        if (marks.has(path) && note.trim()) notesRecord[path] = note
      }
      const data = await apiClient.call('simple-project-viewer.export', { project, pkg, paths: [...marks], notes: notesRecord })
      setStatus(`opened ${data.count} file(s) → ${data.path}`)
      setMarks(new Set())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [project, pkg, marks, notes])

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
      if (editingNote) {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (noteTarget) {
            setNotes((prev) => {
              const next = new Map(prev)
              if (noteInput.trim()) next.set(noteTarget, noteInput)
              else next.delete(noteTarget)
              return next
            })
          }
          setEditingNote(false)
          setNoteTarget(null)
        }
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
      if (e.key === 'i') {
        e.preventDefault()
        const path = focused && fileSet.has(focused) ? focused : null
        if (path) {
          setNoteTarget(path)
          setNoteInput(notes.get(path) ?? '')
          setEditingNote(true)
        }
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
        else if (node.type === 'dir') toggleMarkDir(node)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingPkg, pkgInput, pkgPath, editingNote, noteInput, noteTarget, notes, visible, focused, fileSet, collapsed, loadTree, toggleMark, toggleMarkDir, exportMarked])

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
            marks={marks}
            collapsed={collapsed}
            onFocus={setFocused}
            colors={treeColors}
          />
        </div>
        {editingNote && noteTarget && (
          <div className="p-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="text-[10px] mb-1 truncate" style={{ color: MUTED }}>{noteTarget}</div>
            <textarea
              ref={noteRef}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="notes… (esc to save)"
              rows={4}
              style={{ borderColor: BORDER, color: FG, backgroundColor: BG }}
              className="w-full text-xs border rounded p-1 outline-none resize-none"
            />
          </div>
        )}
        {(error || status) && (
          <div
            className="p-2 text-[10px] break-words"
            style={{ borderTop: `1px solid ${BORDER}`, color: error ? '#cf222e' : MUTED }}
          >
            {error ?? status}
          </div>
        )}
        <div className="p-2 text-[10px]" style={{ borderTop: `1px solid ${BORDER}`, color: MUTED }}>
          p: set pkg · ↑↓: move · ←→: collapse/expand · m: mark · i: note · e: export
        </div>
      </div>
      <div className="flex-1 overflow-auto" style={{ backgroundColor: BG }}>
        {fileContent && <CodeBlock code={fileContent.content} ext={fileContent.ext} />}
      </div>
    </div>
  )
}
