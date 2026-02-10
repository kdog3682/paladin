// @paladin/web/src/stores/app.ts

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  Artifact,
  ServerMessage,
  FileInfo,
  FileHistoryEntry,
  GitStatusEntry,
  RunResult,
} from "@paladin/types"
import type { ViewId } from "../hooks/useView"
import { useLogStore } from "./log"

interface AppState {
  // persistence
  projectName: string
  view: ViewId

  // connection
  isConnected: boolean
  ws: WebSocket | null

  // data
  projects: string[]
  artifacts: Map<string, Artifact>
  gitEntries: GitStatusEntry[]
  fileInfoMap: Map<string, FileInfo>
  fileHistoryMap: Map<string, FileHistoryEntry[]>
  committingFiles: Set<string>

  // actions — persistence
  setView: (view: ViewId) => void
  setProject: (name: string) => void

  // actions — connection
  connect: () => void
  disconnect: () => void
  send: (type: string, data?: Record<string, unknown>) => void

  // actions — artifacts
  renameFile: (id: string, newPath: string) => void
  commitFile: (id: string) => void
  commitFiles: (files: string[]) => void
  commitAll: () => void
  discardFile: (id: string) => void
  requestFileInfo: (id: string) => void
  requestFileHistory: (id: string) => void

  // actions — git
  stageFile: (file: string) => void
  stageFiles: (files: string[]) => void
  unstageFile: (file: string) => void
  unstageAll: () => void
}

const WS_URL = "ws://localhost:3000/ws"

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // persistence defaults
      projectName: "paladin",
      view: 1 as ViewId,

      // connection
      isConnected: false,
      ws: null,

      // data
      projects: [],
      artifacts: new Map(),
      gitEntries: [],
      fileInfoMap: new Map(),
      fileHistoryMap: new Map(),
      committingFiles: new Set(),

      // ── Persistence ────────────────────────────────────

      setView: (view) => set({ view }),

      setProject: (name) => {
        set({
          projectName: name,
          artifacts: new Map(),
          gitEntries: [],
          fileInfoMap: new Map(),
          fileHistoryMap: new Map(),
          committingFiles: new Set(),
        })
        get().send("setProject", { project: name })
      },

      // ── Connection ─────────────────────────────────────

      send: (type, data) => {
        get().ws?.send(JSON.stringify({ type, ...data }))
      },

      connect: () => {
        const existing = get().ws
        if (existing) existing.close()

        const ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          set({ isConnected: true, ws })
          useLogStore.getState().push("info", "WebSocket connected")
          const { projectName } = get()
          ws.send(JSON.stringify({ type: "getProjects" }))
          ws.send(JSON.stringify({ type: "setProject", project: projectName }))
          ws.send(JSON.stringify({ type: "getGitStatus" }))
        }

        ws.onclose = () => {
          set({ isConnected: false, ws: null })
          useLogStore.getState().push("warn", "WebSocket disconnected")
        }
        ws.onerror = () => set({ isConnected: false })

        ws.onmessage = (event) => {
          const msg: ServerMessage = JSON.parse(event.data)
          handleServerMessage(set, get, msg)
        }
      },

      disconnect: () => {
        get().ws?.close()
        set({ isConnected: false, ws: null })
      },

      // ── Artifacts ──────────────────────────────────────

      renameFile: (id, newPath) => get().send("renameFile", { id, newPath }),

      commitFile: (id) => {
        set((s) => {
          const artifact = s.artifacts.get(id)
          if (!artifact?.path) return s
          const next = new Set(s.committingFiles)
          next.add(artifact.path)
          return { committingFiles: next }
        })
        get().send("commitFile", { id })
      },

      commitFiles: (files) => {
        set((s) => {
          const next = new Set(s.committingFiles)
          for (const f of files) next.add(f)
          return { committingFiles: next }
        })
        get().send("commitFiles", { files })
      },

      commitAll: () => {
        const { gitEntries } = get()
        const allFiles = gitEntries.map((e) => e.path)
        if (allFiles.length > 0) get().commitFiles(allFiles)
      },

      discardFile: (id) => {
        get().send("discardFile", { id })
        set((s) => {
          const next = new Map(s.artifacts)
          next.delete(id)
          return { artifacts: next }
        })
      },

      requestFileInfo: (id) => get().send("getFileInfo", { id }),
      requestFileHistory: (id) => get().send("getFileHistory", { id }),

      // ── Git ────────────────────────────────────────────

      stageFile: (file) => get().send("stageFile", { file }),
      stageFiles: (files) => get().send("stageFiles", { files }),
      unstageFile: (file) => get().send("unstageFile", { file }),
      unstageAll: () => get().send("unstageAll"),
    }),
    {
      name: "paladin-store",
      partialize: (state) => ({
        projectName: state.projectName,
        view: state.view,
      }),
    }
  )
)

function handleServerMessage(
  set: (fn: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
  msg: ServerMessage
) {
  switch (msg.type) {
    case "artifactsModified":
    case "filesWritten":
      set((s) => {
        const next = new Map(s.artifacts)
        for (const artifact of msg.artifacts) {
          const existing = next.get(artifact.id)
          next.set(artifact.id, { ...existing, ...artifact })
        }
        return { artifacts: next }
      })
      break

    case "runResult":
      set((s) => {
        const next = new Map(s.artifacts)
        const artifact = next.get(msg.artifactId)
        if (artifact) {
          next.set(msg.artifactId, { ...artifact, runResult: msg.result })
        }
        return { artifacts: next }
      })
      break

    case "gitStatus":
      set({ gitEntries: msg.entries })
      break

    case "projectList":
      if (msg.projects.length > 0) set({ projects: msg.projects })
      break

    case "fileInfo":
      set((s) => ({
        fileInfoMap: new Map(s.fileInfoMap).set(msg.artifactId, msg.info),
      }))
      break

    case "fileHistory":
      set((s) => ({
        fileHistoryMap: new Map(s.fileHistoryMap).set(msg.artifactId, msg.history),
      }))
      break

    case "fileMoved":
      set((s) => {
        const next = new Map(s.artifacts)
        const artifact = next.get(msg.artifactId)
        if (artifact) {
          next.set(msg.artifactId, {
            ...artifact,
            path: msg.newPath,
            aliasedPath: msg.aliasedPath,
          })
        }
        return { artifacts: next }
      })
      break

    case "commitStarted":
      set((s) => {
        const next = new Set(s.committingFiles)
        for (const f of msg.files) next.add(f)
        return { committingFiles: next }
      })
      break

    case "commitCreated":
      set({ committingFiles: new Set() })
      useLogStore.getState().push("success", `Commit created: ${msg.output}`)
      break

    case "depsInstalled": {
      const m = msg as any
      const pkgs = Object.values(m.packages).flat()
      useLogStore.getState().push("info", `Dependencies installed: ${pkgs.join(", ")}`)
      break
    }

    case "projectScaffolded": {
      const m = msg as any
      useLogStore.getState().push("success", `Project scaffolded: ${m.org}`, `Files: ${m.filesCreated.join(", ")}`)
      break
    }
  }
}
