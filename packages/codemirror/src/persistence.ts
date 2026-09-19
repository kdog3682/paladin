import { type SerializedState } from './state'

const PREFIX = 'paladin:editor:'

/** The fileId used when the editor is given none. */
export const DEFAULT_FILE_ID = 'scratchpad'

/**
 * Default `onSave`: writes the snapshot to localStorage under the fileId.
 * Storage can be full, blocked or absent (private windows), and a failed save
 * must not throw out of the editor, so failures are swallowed.
 */
export function saveToLocalStorage(state: SerializedState, fileId: string): void {
  try {
    localStorage.setItem(PREFIX + fileId, JSON.stringify(state))
  } catch {}
}

/**
 * Default `onLoad`: restores what `saveToLocalStorage` wrote, or undefined when
 * there is nothing saved or it can't be read back.
 */
export function loadFromLocalStorage(fileId: string): SerializedState | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + fileId)
    return raw ? (JSON.parse(raw) as SerializedState) : undefined
  } catch {
    return undefined
  }
}
