import { foldState } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'

/**
 * State fields folded into the JSON snapshot alongside doc + selection.
 *
 * This must stay constant for the lifetime of the package: `EditorState.fromJSON`
 * throws if a field listed here isn't present in the extensions it's given. That
 * is why `codeFolding()` is always on in `defaultExtensions` and only the fold
 * *gutter* is optional.
 *
 * `historyField` is deliberately absent — undo history is large, churns on every
 * keystroke, and is rarely worth persisting. To add it, put `history: historyField`
 * here and make `history` non-optional in DefaultExtensionOptions.
 */
export const stateFields = { folds: foldState }

/** A selection range, as `EditorSelection.toJSON()` writes it. */
export type SerializedRange = {
  /** The fixed end of the range. */
  anchor: number
  /** The moving end of the range — where the cursor sits. */
  head: number
}

/** Cursor and selection, as `EditorSelection.toJSON()` writes it. */
export type SerializedSelection = {
  /** Index into `ranges` of the primary range. */
  main: number
  /** All ranges, in document order. A plain cursor is one range with anchor === head. */
  ranges: SerializedRange[]
}

/**
 * Folded ranges, as `foldState.toJSON` writes them: a flat list of offsets read
 * in pairs, so `[10, 24, 80, 96]` is two folds.
 */
export type SerializedFolds = number[]

/**
 * A CodeMirror `EditorState.toJSON()` snapshot plus the fields in `stateFields`.
 *
 * This is the one shape state travels in: exactly what `onSave` emits, and
 * exactly what the `state` prop accepts. Round-tripping it needs no unwrapping.
 */
export type SerializedState = {
  /** The full document text, with '\n' line separators. */
  doc: string
  /**
   * Cursor and selection. Always present on a snapshot the editor produced;
   * optional on one written by hand, where `normalizeSnapshot` fills it in.
   */
  selection?: SerializedSelection
  /** Folded ranges. Absent when nothing is folded. */
  folds?: SerializedFolds
}

/** A collapsed cursor at the start of the document. */
const START: SerializedSelection = { main: 0, ranges: [{ anchor: 0, head: 0 }] }

/**
 * Makes a snapshot safe to hand to `EditorState.fromJSON`.
 *
 * CodeMirror passes `json.selection` straight to `EditorSelection.fromJSON`
 * with no undefined check, so a `{ doc }`-only snapshot throws "Invalid JSON
 * representation for EditorSelection" instead of defaulting the cursor. Writing
 * a snapshot by hand — seeding a new file from plain text, say — is a fair
 * thing to want, so the missing case is filled in here rather than pushed onto
 * every caller.
 */
export function normalizeSnapshot(json: SerializedState): SerializedState {
  return json.selection ? json : { ...json, selection: START }
}

/**
 * Snapshots a view in the same shape `onSave` emits and the `state` prop accepts.
 *
 * Exported so a consumer holding the view from `onViewReady` can save on its own
 * schedule — a route change, a Cmd-S, a pagehide handler — without the editor
 * having to guess which of those matter.
 */
export function serializeEditorState(view: EditorView): SerializedState {
  return view.state.toJSON(stateFields) as SerializedState
}
