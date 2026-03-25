// @paladin/json-viewer-frontend/src/hooks/useNavigation.ts

import { create } from "zustand"

// A path segment: index for arrays, key for objects
export type PathSegment = string | number

export interface NavStore {
  // current cursor path, e.g. [0] for first array item, [0, "name"] for nested
  cursor: PathSegment[]
  // set of serialized paths that are collapsed
  collapsed: Set<string>

  setCursor: (path: PathSegment[]) => void
  moveUp: (data: unknown) => void
  moveDown: (data: unknown) => void
  moveLeft: () => void
  moveRight: (data: unknown) => void
  toggleCollapse: (data: unknown) => void
}

function serializePath(path: PathSegment[]): string {
  return JSON.stringify(path)
}

function getValueAtPath(data: unknown, path: PathSegment[]): unknown {
  let current = data
  for (const seg of path) {
    if (current === null || current === undefined || typeof current !== "object") return undefined
    current = (current as any)[seg]
  }
  return current
}

function getParentValue(data: unknown, path: PathSegment[]): unknown {
  return getValueAtPath(data, path.slice(0, -1))
}

function isPrimitive(val: unknown): boolean {
  return val === null || typeof val !== "object"
}

function getSiblingKeys(data: unknown, path: PathSegment[]): PathSegment[] {
  if (path.length === 0) return []
  const parent = getParentValue(data, path)
  if (parent === null || parent === undefined || typeof parent !== "object") return []
  if (Array.isArray(parent)) return parent.map((_, i) => i)
  return Object.keys(parent)
}

function getChildKeys(data: unknown, path: PathSegment[]): PathSegment[] {
  const val = getValueAtPath(data, path)
  if (val === null || val === undefined || typeof val !== "object") return []
  if (Array.isArray(val)) return val.map((_, i) => i)
  return Object.keys(val)
}

// get the initial cursor for root data
export function getInitialCursor(data: unknown): PathSegment[] {
  if (data === null || typeof data !== "object") return []
  if (Array.isArray(data) && data.length > 0) return [0]
  const keys = Object.keys(data as object)
  if (keys.length > 0) return [keys[0]]
  return []
}

export const useNavStore = create<NavStore>((set, get) => ({
  cursor: [],
  collapsed: new Set<string>(),

  setCursor: (path) => set({ cursor: path }),

  moveUp: (data) => {
    const { cursor } = get()
    if (cursor.length === 0) return

    const siblings = getSiblingKeys(data, cursor)
    const currentSeg = cursor[cursor.length - 1]
    const idx = siblings.indexOf(currentSeg)

    if (idx > 0) {
      set({ cursor: [...cursor.slice(0, -1), siblings[idx - 1]] })
    }
  },

  moveDown: (data) => {
    const { cursor } = get()
    if (cursor.length === 0) return

    const siblings = getSiblingKeys(data, cursor)
    const currentSeg = cursor[cursor.length - 1]
    const idx = siblings.indexOf(currentSeg)

    if (idx < siblings.length - 1) {
      set({ cursor: [...cursor.slice(0, -1), siblings[idx + 1]] })
    }
  },

  moveLeft: () => {
    const { cursor } = get()
    if (cursor.length > 1) {
      set({ cursor: cursor.slice(0, -1) })
    }
  },

  moveRight: (data) => {
    const { cursor, collapsed } = get()
    const val = getValueAtPath(data, cursor)

    if (isPrimitive(val)) return

    const pathKey = serializePath(cursor)
    if (collapsed.has(pathKey)) {
      // uncollapse first
      const next = new Set(collapsed)
      next.delete(pathKey)
      set({ collapsed: next })
      return
    }

    const children = getChildKeys(data, cursor)
    if (children.length > 0) {
      set({ cursor: [...cursor, children[0]] })
    }
  },

  toggleCollapse: (data) => {
    const { cursor, collapsed } = get()
    const val = getValueAtPath(data, cursor)
    const next = new Set(collapsed)

    if (isPrimitive(val)) {
      // primitive: collapse the parent, cursor stays on parent
      if (cursor.length < 1) return
      const parentPath = cursor.slice(0, -1)
      const parentKey = serializePath(parentPath)
      next.add(parentKey)
      set({ collapsed: next, cursor: parentPath })
      return
    }

    // non-primitive: toggle collapse on current node
    const pathKey = serializePath(cursor)
    if (next.has(pathKey)) {
      next.delete(pathKey)
    } else {
      next.add(pathKey)
    }
    set({ collapsed: next })
  },
}))

export function isCollapsed(collapsed: Set<string>, path: PathSegment[]): boolean {
  return collapsed.has(serializePath(path))
}

export function isCursorAt(cursor: PathSegment[], path: PathSegment[]): boolean {
  if (cursor.length !== path.length) return false
  return cursor.every((seg, i) => seg === path[i])
}
