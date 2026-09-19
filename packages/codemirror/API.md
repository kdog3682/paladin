# @paladin/codemirror — Editor API

A React CodeMirror editor. Every prop is optional; with none it is a txflow
scratchpad that saves itself to localStorage.

```tsx
import '@paladin/codemirror/fonts.css'
import { Editor } from '@paladin/codemirror'

export const Scratchpad = () => <Editor className="h-screen" />
```

Import `fonts.css` once, near the app root, so the mono fonts load.

## Props

| Prop | Default | |
| --- | --- | --- |
| `fileId` | `'scratchpad'` | Which file is being edited. Changing it flushes a pending save, then loads the new file. |
| `state` | `onLoad(fileId)` | Snapshot to load. Read on mount and on every `fileId` change. |
| `language` | `'txflow'` | Key into `languages`. Unknown keys fall back to plain text. |
| `languages` | `BUILTIN_LANGUAGES` | The language pack. |
| `font` | the language's font | `'inconsolata'` or `'ncm-mono'`. Overrides the language's preference. |
| `baseExtensions` | `defaultExtensions()` | Editing behaviour shared by every language. |
| `onLoad` | localStorage | `(fileId) => SerializedState \| undefined`, used when `state` is not given. |
| `onSave` | localStorage | `(state, fileId) => void`, debounced. |
| `onSaveDebounceDelay` | `30_000` | ms. A pending save also flushes on unmount and on file switch. |
| `onDirtyChange` | — | `(dirty, fileId)`. Fires on the edges only. |
| `onViewReady` | — | Called once with the `EditorView`. |
| `className` | — | Applied to the container. Size the editor here; it claims no viewport itself. |

Most consumers only need `className`, and `fileId` if they have more than one file.

## Persistence

By default the editor saves to `localStorage` under `paladin:editor:<fileId>`
and restores from there. To store elsewhere, pass both halves:

```tsx
<Editor
  fileId={doc.id}
  onLoad={(id) => cache.get(id)}
  onSave={(state, id) => api.put(`/docs/${id}`, state)}
/>
```

Or pass `state` directly when you already hold the snapshot (fetched from a
server, say); it wins over `onLoad`.

`SerializedState` is one shape everywhere: what `onSave` emits and what `state`
accepts.

```ts
{ doc: string, selection?: { main, ranges }, folds?: number[] }
```

A hand-written `{ doc: 'text' }` is valid; the cursor starts at 0.

Saving is debounced, so a tab closed mid-window can lose up to
`onSaveDebounceDelay` ms of typing. To save on your own schedule, keep the view
from `onViewReady` and call `serializeEditorState(view)`:

```tsx
const view = useRef<EditorView>()
useEffect(() => {
  const save = () => view.current && store(serializeEditorState(view.current))
  addEventListener('pagehide', save)
  return () => removeEventListener('pagehide', save)
}, [])

<Editor onViewReady={(v) => (view.current = v)} />
```

## Languages

`BUILTIN_LANGUAGES` holds `txflow` and `text`. Add code languages by spreading
it. Hoist the map to module scope: a new object per render reconfigures the
editor on every render.

```tsx
import { python } from '@codemirror/lang-python'
import { BUILTIN_LANGUAGES, type LanguageMap } from '@paladin/codemirror'

const LANGUAGES: LanguageMap = {
  ...BUILTIN_LANGUAGES,
  python: { support: python(), placeholder: '# start coding' },
}

<Editor language="python" languages={LANGUAGES} />
```

A `LanguageSpec` takes:

- `support` — CodeMirror language support, eg `python()`.
- `appearance` — the theme. Defaults to the shared default appearance.
- `extensions` — behaviour specific to this language (txflow uses this for its input rules). Layered on top of `baseExtensions`.
- `font`, `wrapLines` (default `true`), `placeholder`.

## Base extensions

`baseExtensions` replaces the shared behaviour. Tune it through
`defaultExtensions`, and hoist the result:

```tsx
import { defaultExtensions } from '@paladin/codemirror'

const BASE = defaultExtensions({ lineNumbers: true, foldGutter: true })

<Editor baseExtensions={BASE} />
```

Options: `lineNumbers`, `foldGutter`, `highlightActiveLine`, `indentUnit`,
`indentOnInput`, `tabIndents`, `history`, `search`, `brackets`,
`cursorBlinkRate`. Folding is always on, since snapshots serialize fold state.

`baseExtensions` is read once, at mount.

## Exports

`Editor`, `EditorProps`, `defaultExtensions`, `BUILTIN_LANGUAGES`,
`DEFAULT_LANGUAGE`, `LanguageMap`, `LanguageSpec`, `SerializedState`,
`serializeEditorState`, `saveToLocalStorage`, `loadFromLocalStorage`,
`DEFAULT_FILE_ID`, `FONT_STACKS`, `FontKey`.

## Source layout

```
src/
  components/editor.tsx     the Editor
  defaultExtensions.ts      base behaviour
  persistence.ts            default localStorage save/load
  languages/
    index.ts                BUILTIN_LANGUAGES, resolveLanguage
    default/appearance.ts   look shared by languages without their own
    txflow/                 appearance.ts, extensions.ts (input rules)
  extensions/inputRules/    the input-rules engine and its presets
```
