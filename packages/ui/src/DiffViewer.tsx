import { useState, useMemo } from "react"

type LineType = "add" | "remove" | "context"

interface DiffLine {
  type: LineType
  content: string
  lineNum: number
}

interface FileDiff {
  path: string
  hunks: DiffLine[][]
}

function parseDiff(diff: string): FileDiff[] {
  const lines = diff.split("\n")
  const files: FileDiff[] = []
  let current: FileDiff | null = null
  let hunk: DiffLine[] | null = null
  let oldNum = 0
  let newNum = 0

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (current) files.push(current)
      current = { path: "", hunks: [] }
      hunk = null
    } else if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "")
      if (current) current.path = path
    } else if (line.startsWith("--- ") || line.startsWith("index ")) {
      // ignored
    } else if (line.startsWith("@@")) {
      const match = line.match(/-(\d+)(?:,\d+)? \+(\d+)(?:,\d+)?/)
      oldNum = match ? parseInt(match[1], 10) : 0
      newNum = match ? parseInt(match[2], 10) : 0
      hunk = []
      if (current) current.hunks.push(hunk)
    } else if (hunk && line.startsWith("+")) {
      hunk.push({ type: "add", content: line.slice(1), lineNum: newNum++ })
    } else if (hunk && line.startsWith("-")) {
      hunk.push({ type: "remove", content: line.slice(1), lineNum: oldNum++ })
    } else if (hunk && (line.startsWith(" ") || line === "")) {
      hunk.push({ type: "context", content: line.slice(1), lineNum: newNum })
      oldNum++
      newNum++
    }
  }
  if (current) files.push(current)

  return files
}

const lineStyles: Record<LineType, string> = {
  add: "text-green-900",
  remove: "text-red-900",
  context: "text-zinc-600",
}

const lineBg: Record<LineType, string> = {
  add: "#e5f8e2",
  remove: "#f8e2e2",
  context: "transparent",
}

interface DiffViewerProps {
  diff: string
  files?: string[]
}

export function DiffViewer({ diff, files = [] }: DiffViewerProps) {
  const parsed = useMemo(() => parseDiff(diff), [diff])
  const visible = files.length === 0 ? parsed : parsed.filter((f) => files.includes(f.path))

  return (
    <div className="flex flex-col gap-4 bg-white">
      {visible.map((file, fi) => (
        <div key={fi} className="rounded-md border border-zinc-200 overflow-hidden">
          <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-700">
            {file.path}
          </div>
          <div className="font-mono text-xs">
            {file.hunks.map((hunk, hi) => (
              <div key={hi}>
                {hi > 0 && (
                  <div className="py-5">
                    <div className="mx-3 h-px bg-zinc-200" />
                  </div>
                )}
                {hunk.map((line, li) => (
                  <div
                    key={li}
                    className={`flex px-1 py-0.5 ${lineStyles[line.type]}`}
                    style={{ backgroundColor: lineBg[line.type] }}
                  >
                    <span className="mr-2 w-8 select-none text-right text-zinc-400">
                      {line.lineNum}
                    </span>
                    <span className="whitespace-pre">{line.content}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const sampleDiff = `diff --git a/src/app.ts b/src/app.ts
index e69de29..4b825dc 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -179,4 +179,5 @@
 function start() {
-  console.log("old")
+  console.log("new")
+  console.log("added line")
   return true
 }
diff --git a/src/utils/format.ts b/src/utils/format.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/utils/format.ts
+++ b/src/utils/format.ts
@@ -12,3 +12,3 @@
 export function format(value: string) {
-  return value.trim()
+  return value.trim().toLowerCase()
 }
diff --git a/README.md b/README.md
index 9f8e7d6..3c2b1a0 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
 # Project
+Now with more features.
@@ -10,3 +11,4 @@
 ## Installation
 npm install
+npm run build
`

export default function DiffViewerDemo() {
  const [diffText, setDiffText] = useState(sampleDiff)
  const [selected, setSelected] = useState<string>("all")

  const parsed = useMemo(() => parseDiff(diffText), [diffText])
  const filePaths = parsed.map((f) => f.path)
  const activeFiles = selected === "all" ? [] : [selected]

  return (
    <div className="flex h-screen flex-col gap-3 bg-white p-4">
      <textarea
        value={diffText}
        onChange={(e) => setDiffText(e.target.value)}
        placeholder="Paste a git diff here"
        className="h-40 w-full rounded-md border border-zinc-300 bg-zinc-50 p-2 font-mono text-xs text-zinc-800 outline-none"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-600">File:</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800"
        >
          <option value="all">All files</option>
          {filePaths.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-auto">
        <DiffViewer diff={diffText} files={activeFiles} />
      </div>
    </div>
  )
}
