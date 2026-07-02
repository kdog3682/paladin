import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import type { CommandSpec } from './commands/types'

type Mode = 'normal' | 'insert' | 'cmdline' // 'cmdline' = writing-mode (past abbr + space)

interface ModeSlice {
  mode: Mode
  setMode: (m: Mode) => void
}

interface Project {
  name: string
  dir: string
}

interface ProjectSlice {
  project: Project
  setProject: (p: Project) => void // called by `cd` cmdline command
}

interface ViewSlice {
  view: EditorView | null
  setView: (v: EditorView | null) => void
}

// the doc open in the editor. docId assigned by the backend on doc.create — never generated client-side.
interface DocMetaSlice {
  docId: string
  docProject: string
  docTitle: string
  setDocMeta: (m: Partial<{ docId: string; docProject: string; docTitle: string }>) => void
}

interface CmdlineSlice {
  cmdBuffer: string
  cmdCommand: CommandSpec | null
  cmdArgs: string[] // args already collected for the current command
  cmdArgIndex: number // which arg is currently being written
  cmdArg: string // in-progress text for the current arg
  cmdSuggestions: string[]
  cmdError: string | null
  setCmdline: (
    patch: Partial<
      Pick<
        CmdlineSlice,
        'cmdBuffer' | 'cmdCommand' | 'cmdArgs' | 'cmdArgIndex' | 'cmdArg' | 'cmdSuggestions' | 'cmdError'
      >
    >
  ) => void
  resetCmdline: () => void
}

export interface LogEntry {
  id: string
  type: string
  payload: unknown
  at: number
}

interface LogSlice {
  logs: LogEntry[]
  postLog: (entry: { type: string; payload: unknown }) => void
}

type OmniView = 'recent' | 'notes' | 'logs' | 'help'

interface OmniSlice {
  omniOpen: boolean
  omniView: OmniView
  omniPinned: boolean
  omniItems: unknown[]
  openOmni: (view: OmniView, opts?: { pinned?: boolean }) => void
  closeOmni: () => void
  setOmniItems: (items: unknown[]) => void
}

type ZenMode = 'none' | 'partial' | 'full'

interface ZenSlice {
  zenMode: ZenMode
  setZenMode: (m: ZenMode) => void
}

type AppState = ModeSlice & ProjectSlice & ViewSlice & DocMetaSlice & CmdlineSlice & LogSlice & OmniSlice & ZenSlice

const createModeSlice = (set: any): ModeSlice => ({
  mode: 'normal',
  setMode: (mode) => set({ mode }),
})

const createProjectSlice = (set: any): ProjectSlice => ({
  project: { name: '', dir: '' },
  setProject: (project) => set({ project }),
})

const createViewSlice = (set: any): ViewSlice => ({
  view: null,
  setView: (view) => set({ view }),
})

const createDocMetaSlice = (set: any): DocMetaSlice => ({
  docId: '',
  docProject: 'scratchpad',
  docTitle: 'untitled',
  setDocMeta: (m) =>
    set((s: AppState) => ({
      docId: m.docId ?? s.docId,
      docProject: m.docProject ?? s.docProject,
      docTitle: m.docTitle ?? s.docTitle,
    })),
})

const createCmdlineSlice = (set: any): CmdlineSlice => ({
  cmdBuffer: '',
  cmdCommand: null,
  cmdArgs: [],
  cmdArgIndex: 0,
  cmdArg: '',
  cmdSuggestions: [],
  cmdError: null,
  setCmdline: (patch) => set(patch),
  resetCmdline: () =>
    set({
      cmdBuffer: '',
      cmdCommand: null,
      cmdArgs: [],
      cmdArgIndex: 0,
      cmdArg: '',
      cmdSuggestions: [],
      cmdError: null,
    }),
})

const createLogSlice = (set: any): LogSlice => ({
  logs: [],
  postLog: (entry) =>
    set((s: AppState) => ({
      logs: [{ id: crypto.randomUUID(), at: Date.now(), ...entry }, ...s.logs].slice(0, 200),
    })),
})

const createOmniSlice = (set: any): OmniSlice => ({
  omniOpen: false,
  omniView: 'recent',
  omniPinned: false,
  omniItems: [],
  openOmni: (view, opts) => set({ omniOpen: true, omniView: view, omniPinned: opts?.pinned ?? false }),
  closeOmni: () => set({ omniOpen: false, omniPinned: false }),
  setOmniItems: (omniItems) => set({ omniItems }),
})

const createZenSlice = (set: any): ZenSlice => ({
  zenMode: 'none',
  setZenMode: (zenMode) => set({ zenMode }),
})

export const useAppStore = create<AppState>((set) => ({
  ...createModeSlice(set),
  ...createProjectSlice(set),
  ...createViewSlice(set),
  ...createDocMetaSlice(set),
  ...createCmdlineSlice(set),
  ...createLogSlice(set),
  ...createOmniSlice(set),
  ...createZenSlice(set),
}))
