# Notes

Local-first notes app (CodeMirror editor, zustand store persisted to `localStorage` key `paladin.notes.v1`).

- `store/notes.ts`: notes, bookmarks, `importNotes` (merge by id, newer `updatedAt` wins)
- `hooks/use-note-hotkeys.ts`: all shortcuts (also listed in `components/NoteHelp.tsx`)
- `lib/editor.ts`, `store/editor.ts`: editor view access

## Keys

- alt+n new, alt+r rename, alt+d delete, alt+c copy
- cmd/ctrl+e (or alt+e) export `notes.json`; cmd/ctrl+o import it
- cmd/ctrl+k or alt+f search, alt+up/down step, alt+1-0 jump to bookmark, alt+shift+1-0 set it
- cmd/ctrl+/ help

## Build

`webrun packages/web2/src/applets/Notes/App.tsx --build` writes `~/.paladin/apps/paladin__packages__web2__src__applets__Notes__App.html`.
Every `file://` page shares one localStorage, so builds under different names still see the same notes. `localhost` does not: export, then import.
