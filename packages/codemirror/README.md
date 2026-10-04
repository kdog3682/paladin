# @paladin/codemirror

A React `<Editor />` built on CodeMirror 6. Out of the box it is a txflow editor that saves itself to localStorage and restores the cursor, selection and folds on the next load.

## Quick start

```tsx
import '@paladin/codemirror/fonts.css'
import { Editor } from '@paladin/codemirror'

export const Scratchpad = () => <Editor className="h-screen" />
```

- `fonts.css` is optional. It ships Inconsolata and NCM Mono. Without it the editor falls back to the system monospace.
- The editor claims no viewport. Give it a height through `className` (or a parent). It fills its container and the inner scroller scrolls, not the page.
- `react` and `react-dom` (^18) are peer dependencies.

## Props

All props are optional.

| Prop | Default | Notes |
| --- | --- | --- |
| `fileId` | `'scratchpad'` | The file being edited. Changing it saves the old file and loads the new one. |
| `language` | `'txflow'` | Key into `languages`. Unknown keys fall back to plain text. |
| `languages` | `BUILTIN_LANGUAGES` | Language registry. Hoist custom maps to module scope. |
| `font` | `'inconsolata'` | `'inconsolata' \| 'ncm-mono' \| 'inherit'`. Changes live, no remount. |
| `fontSize` | `12` | Number = px, string = any CSS size. |
| `lineHeight` | `1.15` | Number = unitless multiplier, string = any CSS value. |
| `lineNumbers`, `foldGutter`, `highlightActiveLine`, `indentUnit`, `indentOnInput`, `tabIndents`, `history`, `search`, `brackets`, `cursorBlinkRate` | see [Editing behaviour](#editing-behaviour) | Editing options, passed straight to the editor. Change live, no remount. |
| `state` | `onLoad(fileId)` | Snapshot to load, `{ doc, selection?, folds? }`. Wins over `onLoad`. |
| `onLoad` | localStorage | `(fileId) => SerializedState \| undefined` |
| `onSave` | localStorage | `(state, fileId) => void`, debounced. |
| `onSaveDebounceDelay` | `30_000` | Debounce window for `onSave`, in ms. |
| `onLeave` | `onSave` | `(state, fileId) => void`. Must be synchronous. See below. |
| `onDirtyChange` | none | `(dirty, fileId) => void`. Fires on the edges only. |
| `onChange` | none | `(doc: string) => void`. Full text after every edit. |
| `onViewReady` | none | Receives the `EditorView` once, after mount. |
| `autofocus` | `true` | Focus on mount and file switch, scrolling the restored cursor into view. |
| `className` | none | Class for the container element. Size the editor here. |

## Multiple files

Drive the editor with `fileId`. Switching it flushes any pending save for the old file, then loads the new one through `onLoad` (or `state`).

```tsx
const [id, setId] = useState('notes')

<Editor fileId={id} className="h-full" />
```

With the default persistence, each `fileId` gets its own localStorage entry (`paladin:editor:<fileId>`).

## Save somewhere else

```tsx
<Editor
  fileId={doc.id}
  onLoad={(id) => cache.get(id)}
  onSave={(state, id) => api.put(`/docs/${id}`, state)}
  onLeave={(state, id) => navigator.sendBeacon(`/docs/${id}`, JSON.stringify(state))}
/>
```

- `onLoad` is synchronous and returns a `SerializedState`, or `undefined` for an empty document.
- `onSave` runs 30s after the last edit (tune with `onSaveDebounceDelay`), and also when the editor unmounts or `fileId` changes.
- `onLeave` fires when the tab is hidden or the page closes, and only if there are unsaved edits or cursor moves. The page may not outlive it, so keep it synchronous (`sendBeacon`, localStorage). It does not replace `onSave`.
- Storage failures in the default localStorage handlers are swallowed. They never throw out of the editor.

### Snapshot shape

`onSave` emits and `state` accepts the same shape, so a snapshot round-trips with no unwrapping.

```ts
type SerializedState = {
  doc: string
  selection?: { main: number; ranges: { anchor: number; head: number }[] }
  folds?: number[] // flat [from, to, from, to, ...]
}
```

A hand-written `{ doc: '...' }` is valid. The cursor defaults to the start. Undo history is not persisted.

To seed a file from plain text:

```tsx
<Editor fileId="new" state={{ doc: '# Title\n' }} />
```

## Driving the editor

`onViewReady` hands you the `EditorView`. Use `serializeEditorState(view)` to snapshot it on your own schedule, for example on Cmd-S.

```tsx
import { Editor, serializeEditorState } from '@paladin/codemirror'

const viewRef = useRef<EditorView>()

<Editor onViewReady={(v) => (viewRef.current = v)} />

const save = () => api.put('/doc', serializeEditorState(viewRef.current!))
```

Show an unsaved indicator with `onDirtyChange`:

```tsx
const [dirty, setDirty] = useState(false)
<Editor onDirtyChange={setDirty} />
```

## Editing behaviour

The editing defaults (undo, search, bracket closing, folding, and so on) are built in. Tune them with props:

```tsx
<Editor lineNumbers foldGutter highlightActiveLine />
```

| Prop | Default | |
| --- | --- | --- |
| `lineNumbers` | `false` | Line-number gutter. |
| `foldGutter` | `false` | Fold arrows. Folding itself is always on. |
| `highlightActiveLine` | `false` | Tint the cursor's line and gutter entry. |
| `indentUnit` | two spaces | String inserted per indent level. |
| `indentOnInput` | `true` | Re-indent as content makes the indentation clear. |
| `tabIndents` | `true` | Tab indents instead of moving focus. |
| `history` | `true` | Undo/redo and keymap. |
| `search` | `true` | Find/replace panel and keymap. |
| `brackets` | `true` | Auto-close and match brackets and quotes. |
| `cursorBlinkRate` | `1400` | ms; `0` holds the cursor steady. |

Folding is always on, because persisted state includes folds. `foldGutter` only controls the arrows.

## Languages

A language is a `LanguageSpec`, looked up by the `language` prop.

```ts
type LanguageSpec = {
  support?: Extension    // eg python()
  appearance?: Extension // the theme/look
  extensions?: Extension // behaviour on top of the editing defaults
  wrapLines?: boolean    // default true
  placeholder?: string   // default `start typing in <key>`
}
```

Add one by spreading the built-ins:

```tsx
import { python } from '@codemirror/lang-python'
import { BUILTIN_LANGUAGES } from '@paladin/codemirror'

// module scope: a new object per render reconfigures the editor
const LANGUAGES = { ...BUILTIN_LANGUAGES, python: { support: python(), wrapLines: false } }

<Editor language="python" languages={LANGUAGES} />
```

`language`, `languages`, `font`, `fontSize` and `lineHeight` can change at any time. The editor reconfigures in place, keeping the document and cursor.

Built in: `txflow`, `text`, `javascript`, `jsx`, `typescript` and `tsx` (the code ones don't wrap lines).

`txflow` adds `#` heading folds and the markdown input rules (dash bullets, rules, headings) on top of the editing defaults.

Every language gets, through the editing defaults: a vim normal mode that starts on Esc, the punctuation, bracket and code input rules, `q`-leader insert chords (`qw`, `qe`, `ql`, `qd`, `qp`), smart Enter, indent-aware comment toggling (`Mod-/`), export-below-cursor (`Mod-e`), and reflowing paste.

## Exports

| Export | |
| --- | --- |
| `Editor`, `EditorProps` | The component. |
| `defaultExtensions`, `DefaultExtensionOptions` | The editing defaults, for building a CodeMirror state outside `<Editor>`. |
| `BUILTIN_LANGUAGES`, `DEFAULT_LANGUAGE`, `LanguageMap`, `LanguageSpec` | Language registry. |
| `serializeEditorState`, `SerializedState` | Snapshot a view. |
| `loadFromLocalStorage`, `saveToLocalStorage`, `DEFAULT_FILE_ID` | The default persistence, reusable in your own `onLoad`/`onSave`. |
| `FONT_STACKS`, `FontKey` | Font choices, for building a settings UI. |
| `@paladin/codemirror/fonts.css` | Font-face declarations. |

## Tests

```sh
bun test --preload ./happydom.ts
```
