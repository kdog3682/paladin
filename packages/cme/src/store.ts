import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'
import type { CommandSpec } from './commandSpec'
import { defaultScratchpadName } from './commandSpec'

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
  view: EditorView | null // set on CM mount, cleared on unmount
  setView: (v: EditorView | null) => void
}

// the doc currently open in the editor. docId is assigned by the backend on doc.create — never generated client-side.
// setDocMeta is the single place this updates: doc.create, doc.open, `st`/`sp` cmdline commands.
interface DocMetaSlice {
  docId: string
  docProject: string
  docTitle: string
  setDocMeta: (m: Partial<{ docId: string; docProject: string; docTitle: string }>) => void
}

interface CmdlineSlice {
  cmdBuffer: string // raw abbr chars while buffering, 'name ' prefix while writing
  cmdCommand: CommandSpec | null
  cmdArg: string
  cmdSuggestions: string[]
  cmdError: string | null
  setCmdline: (
    patch: Partial<Pick<CmdlineSlice, 'cmdBuffer' | 'cmdCommand' | 'cmdArg' | 'cmdSuggestions' | 'cmdError'>>
  ) => void
  resetCmdline: () => void
}

type AppState = ModeSlice & ProjectSlice & ViewSlice & DocMetaSlice & CmdlineSlice

const createModeSlice = (set: any): ModeSlice => ({
  mode: 'normal',
  setMode: (mode) => set({ mode }),
})

const createProjectSlice = (set: any): ProjectSlice => ({
  project: { name: '', dir: '' }, // hydrated on boot
  setProject: (project) => set({ project }),
})

const createViewSlice = (set: any): ViewSlice => ({
  view: null,
  setView: (view) => set({ view }),
})

const createDocMetaSlice = (set: any): DocMetaSlice => ({
  docId: '', // hydrated on doc load / doc.create response
  docProject: 'scratchpad',
  docTitle: defaultScratchpadName(),
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
  cmdArg: '',
  cmdSuggestions: [],
  cmdError: null,
  setCmdline: (patch) => set(patch),
  resetCmdline: () => set({ cmdBuffer: '', cmdCommand: null, cmdArg: '', cmdSuggestions: [], cmdError: null }),
})

export const useAppStore = create<AppState>((set) => ({
  ...createModeSlice(set),
  ...createProjectSlice(set),
  ...createViewSlice(set),
  ...createDocMetaSlice(set),
  ...createCmdlineSlice(set),
}))
