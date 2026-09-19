# @paladin/codemirror

```tsx
import '@paladin/codemirror/fonts.css'
import { Editor } from '@paladin/codemirror'

export const Scratchpad = () => <Editor className="h-screen" />
```

That is a working txflow editor. It saves itself to localStorage and restores
on the next load. Size it with `className`; it claims no viewport of its own.

## Props

All optional.

| Prop | Default | |
| --- | --- | --- |
| `fileId` | `'scratchpad'` | The file being edited. Changing it saves the old file and loads the new one. |
| `language` | `'txflow'` | Key into `languages`. |
| `languages` | `BUILTIN_LANGUAGES` | Language pack. Hoist custom maps to module scope. |
| `state` | `onLoad(fileId)` | Snapshot to load, `{ doc: string, ... }`. |
| `onLoad` | localStorage | `(fileId) => state \| undefined` |
| `onSave` | localStorage | `(state, fileId) => void`, debounced 30s. |
| `onLeave` | localStorage | `(state, fileId) => void`, sync. Fires when the tab is hidden or closed with unsaved edits. |
| `onDirtyChange` | — | `(dirty, fileId) => void` |
| `onViewReady` | — | Receives the `EditorView`. |
| `className` | — | Container class. |

## Save somewhere else

```tsx
<Editor
  fileId={doc.id}
  onLoad={(id) => cache.get(id)}
  onSave={(state, id) => api.put(`/docs/${id}`, state)}
  onLeave={(state, id) => navigator.sendBeacon(`/docs/${id}`, JSON.stringify(state))}
/>
```

`onLeave` runs as the page goes away, so it must be synchronous.

## Add a language

```tsx
import { python } from '@codemirror/lang-python'
import { BUILTIN_LANGUAGES } from '@paladin/codemirror'

const LANGUAGES = { ...BUILTIN_LANGUAGES, python: { support: python() } }

<Editor language="python" languages={LANGUAGES} />
```
