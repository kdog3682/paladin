# @paladin/codemirror

React CodeMirror editor. Consumer-facing usage is in `API.md` (keep it minimal);
this file is the deeper reference for working on the package.

Tests: `bun test --preload ./happydom.ts` (or `bun run test`). The DOM globals
come from the preload; without it everything fails with `document is not defined`.

## Layout

```
src/
  components/editor.tsx     the Editor
  defaultExtensions.ts      base behaviour shared by every language
  persistence.ts            default localStorage save/load, DEFAULT_FILE_ID
  state.ts                  SerializedState, stateFields, serializeEditorState
  fonts.ts                  FONT_STACKS, fontExtension
  languages/
    index.ts                BUILTIN_LANGUAGES (the default pack), DEFAULT_LANGUAGE, resolveLanguage
    types.ts                LanguageSpec, LanguageMap, ResolvedLanguage
    default/appearance.ts   look for languages that don't bring their own
    txflow/                 appearance.ts, extensions.ts (input rules), index.ts (the spec)
  extensions/inputRules/    the engine and presets; index.ts exports packedInputRules
```

Everything specific to a language lives under `languages/<name>/`. Bespoke
languages set `appearance` and `extensions` on their spec; standard ones leave
`appearance` unset and get the default.

## Editor defaults

`fileId` 'scratchpad', `language` 'txflow', `languages` BUILTIN_LANGUAGES,
`baseExtensions` `defaultExtensions()`, `onSave`/`onLeave` `saveToLocalStorage`,
`onLoad` `loadFromLocalStorage` (used only when `state` is absent). Each default
is named in the prop's doc comment; keep the two in sync.

## Behaviour worth knowing

- **Extension layering.** `baseExtensions` (built once, at mount) → language
  config in a Compartment: placeholder, `support`, `appearance`, `extensions`,
  font, wrapping. Reconfigured when `language`, `languages` or `font` change.
  Extensions are rebuilt per state (`makeState`), not frozen at mount, so a file
  loaded later gets the current language config.
- **Font precedence.** `font` prop, then the language's `font`, then `DEFAULT_FONT`.
  Appearances read the family from a CSS variable so they work with either.
- **Props are read through `useLatest` refs.** Mount-only effects and the
  debounced saver must see current props, not the first render's.
- **Saving.**
  - `onSave` is debounced (`onSaveDebounceDelay`, default 30s). It also flushes
    on unmount and before a file switch.
  - `onLeave` runs synchronously on `visibilitychange` (to hidden) and
    `pagehide`. It only fires when dirty, once per burst of edits (`leftRef`,
    reset on the next doc change). It does not clear dirty or cancel the
    debounce: if the user returns, `onSave` still runs.
  - The default `onLeave` writes localStorage even if the consumer overrides
    `onSave`/`onLoad`. Harmless, but a consumer with a custom store should
    override `onLeave` too.
- **Cursor.** Restored from the snapshot and focused on load (`autofocus`).
  Cursor moves are saved by `onLeave` only, not `onSave`.
- **Snapshots.** `SerializedState` is `EditorState.toJSON(stateFields)`.
  `stateFields` must stay constant: `fromJSON` throws if a listed field isn't in
  the extensions, which is why `codeFolding()` is unconditional in
  `defaultExtensions` and only the fold gutter is optional. A snapshot without
  `selection` is filled in by `normalizeSnapshot`.
- **localStorage** keys are `paladin:editor:<fileId>`. All access is in
  try/catch; a failed save is silent and a failed load returns `undefined`.

## defaultExtensions options

`lineNumbers`, `foldGutter`, `highlightActiveLine`, `indentUnit`,
`indentOnInput`, `tabIndents`, `history`, `search`, `brackets`,
`cursorBlinkRate`. Defaults are in the option doc comments.

## LanguageSpec

`support`, `appearance` (default: DEFAULT_APPEARANCE), `extensions` (language
behaviour, on top of `baseExtensions`), `font`, `wrapLines` (true), `placeholder`
(`start typing in <key>`). Unknown language keys resolve to an empty spec.

## Public exports (`src/index.ts`)

`Editor`, `EditorProps`, `defaultExtensions`, `DefaultExtensionOptions`,
`BUILTIN_LANGUAGES`, `DEFAULT_LANGUAGE`, `LanguageMap`, `LanguageSpec`,
`SerializedState`, `serializeEditorState`, `saveToLocalStorage`,
`loadFromLocalStorage`, `DEFAULT_FILE_ID`, `FONT_STACKS`, `FontKey`.
