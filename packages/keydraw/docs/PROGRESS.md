# keydraw — progress

Handoff notes to read alongside `SPEC.md`. Section numbers (§) refer to the spec.

## Status

| # | Milestone | State |
|---|---|---|
| 1 | Tree model, store, artboard render, focus ring, status line, property registry | done |
| 2 | Key trie and parser, with unit tests | done (12 tests in `keys/parser.test.ts`, all pass) |
| 3 | Arrow navigation, selection, `f` hints | done |
| 4 | Insertion rule, quick-create, `o`/`O`, delete, yank, paste, undo/redo | done |
| 5 | Input mode | done, except auto-wrap (milestone 9) |
| 6 | Move mode | done, wired (smoke test in `src/wiring.test.ts`) |
| 7 | Attributes panel | done, wired |
| 8 | Search | done (`search/`, tests in `search/match.test.ts` and `src/wiring.test.ts`) |
| 9 | Wrap/unwrap, auto-wrap, align, distribute, Draw mode | done |
| 10 | Command line, defaults modal | done |
| 11 | Components, named styles, icons, `Alt-l` loader | done |
| 12 | Export (YAML, PNG, SVG), settings import/export, keymap editor, which-key, `:help` | done |
| 13 | Bound arrows, `.` repeat, layer tree, lock and hide, exact restore | done |

Milestones 6 and 7 are wired into the existing tables. Binding tables live in pure modules (`move-mode/bindings.ts`, `ui/attrsBindings.ts`) so `keymap.default.ts` can import them without an import cycle through the store.

A command ID with no handler shows `not implemented yet: <id>` in the status line.

Import-cycle rule: anything `keys/keymap.default.ts` or `commands/registry.ts` imports must be a leaf module with no store import. Binding tables and command lists therefore live in `*/bindings.ts` files (`arrange/`, `draw-mode/`, `cmdline/`, `ui/modalBindings.ts`), and the `commands.ts` next to them re-exports.

## Files

```
src/
  arrange/     arrange.ts bindings.ts commands.ts arrange.test.ts
  draw-mode/   state.ts draw.ts bindings.ts commands.ts draw.test.ts
  cmdline/     parse.ts complete.ts exec.ts bindings.ts commands.ts cmdline.test.ts
  search/      match.ts bindings.ts search.ts match.test.ts
  model/       types.ts tree.ts geometry.ts placement.ts binding.ts
  props/       registry.ts parse.ts presets.ts
  keys/        notation.ts keymap.default.ts trie.ts parser.ts hints.ts parser.test.ts extend.ts
  input-mode/  tokenize.ts apply.ts complete.ts nudge.ts cycle.ts styles.ts
  move-mode/   move.ts session.ts commands.ts bindings.ts
  commands/    registry.ts changes.ts commands.ts dispatch.ts extraChanges.ts
  store/       useEditor.ts slices/{doc,focus,selection,mode,search,viewport,defaults,config,styles,components,ui}.ts
  storage/     adapter.ts localAdapter.ts idbAdapter.ts
  io/          yaml.ts image.ts settings.ts docs.ts
  icons/       catalog.ts
  render/      SearchLayer.tsx DrawLayer.tsx ArrowLayer.tsx Viewport.tsx ArtboardView.tsx NodeView.tsx style.ts useBox.ts FocusLayer.tsx HintLayer.tsx TokenLine.tsx
  ui/          StatusLine.tsx SearchLine.tsx CmdLine.tsx AttributesPanel.tsx LayerTree.tsx WhichKey.tsx Modals.tsx RowLine.tsx
               attrs.ts attrsPanelState.ts attrsCommands.ts attrsBindings.ts
               modal.ts modalBindings.ts modalCommands.ts defaultsRows.ts keyRows.ts fuzzy.ts modals.test.ts
  App.tsx wiring.test.ts arrows.test.ts render.test.tsx
```

Not in the spec's §18 layout: `keys/notation.ts`, `keys/extend.ts`, `commands/changes.ts`, `commands/dispatch.ts`, `commands/extraChanges.ts`, `move-mode/session.ts`, `render/style.ts`, `render/useBox.ts`, `ui/attrs*.ts`, `ui/modal*.ts`, `ui/defaultsRows.ts`, `ui/keyRows.ts`, `ui/RowLine.tsx`, `ui/Modals.tsx` (one file for all five modals instead of `DefaultsModal`, `KeymapModal`, `ComponentLoader`, `IconPicker`), `store/slices/ui.ts`, `io/docs.ts`, `io/settings.ts`, `storage/idbAdapter.ts`, and the `bindings.ts` leaf files.

Spec files not created: `commands/history.ts` (history lives in the doc slice), `render/GridLayer`, `cmdline/history.ts` (history is in `cmdline/commands.ts`).

Dependencies: `zustand`, `immer`, `lucide-react`, `@paladin/shadcn`, `@paladin/ui` (HelpPalette), `yaml`, `html-to-image` (loaded on first PNG/SVG export), `idb-keyval` (storage fallback).

## Architecture

### Model (`model/`)

- **Doc shape:** `Doc` holds a flat `nodes` map. Each `Node` has `parent` and `children` ids and a `props: Record<string, unknown>` map keyed by the prop's canonical name.
- **Node kinds:**
  - Frames carry `shape: rect | ellipse | diamond`.
  - Text spans are `kind: "text"` with `inline: true`.
- **Layout** is the `layout` prop (`absolute` | `flex` | `grid`), defaulting to `absolute`. `layoutOf(node)` reads it.
- **Artboards** are `{ id, name, root, width, height }`. Order is in `doc.boardOrder`, and the open board is `doc.currentBoard`.
- **Untitled docs** are titled with `timestampTitle()`.
- **`geometry.ts`:**
  - `elements` maps node id to its DOM element; `NodeView` registers each one.
  - `viewportEl` holds the viewport element.
  - `boxIn()` measures a node in artboard coordinates, dividing out zoom.
  - `offsetBox()` reads layout offsets, which zoom doesn't affect.
- **`placement.ts`:** `placeNext()` positions a new child of an absolute parent. It goes to the right of or below the previous sibling, using `defaults.placement.{place, gap}`. The previous sibling is measured from the DOM, with an estimate as fallback; the first child goes at the parent's padding origin.

### Props (`props/`)

- **Registry:** `PROPS: PropDef[]`, with `byName` and `byAlias` maps. Canonical names also work as aliases.
- **`toCss(v, ctx)`:** the second argument is a `CssCtx` of `{ parentLayout, parentDir, parentPad }` (the spec's signature has only `v`). The context makes `%` sizes resolve against the parent's content box in absolute parents, using `calc((100% - pad) * n)`. It also makes `fill` behave per layout:
  - flex main axis: `flex: 1 1 0`
  - flex cross axis: `alignSelf: stretch`
  - absolute parent: 100% of the content box
- **Lengths** are stored as `{ n, unit: "px" | "%" }`, or as `"fill"` / `"hug"`.
- **Colors** are a theme token name or a raw CSS value. `colorCss` maps tokens to `var(--token)`, which assumes shadcn v4-style CSS variables. If `@paladin/shadcn` uses v3 HSL channels, change it to `hsl(var(--token))`.
- **Props beyond the spec:** `layout` and `flex:items start|center|end|stretch`.
- **Helpers:** `isToggleable`, `cycleValues` (bool cycles `on`/`off`; colors cycle `THEME_COLORS`), `formatToken`, `formatValue` and `padOf`.

### Keys (`keys/`)

- **Notation** is vim style:
  - Printable keys are bare: `a`, `A`, `?`.
  - Everything else is bracketed, with modifiers in the order C A M S: `<Up>`, `<S-Up>`, `<A-r>`, `<A-S-l>`, `<Space>`, `<S-BS>`.
  - `<mod-x>` means Cmd on Mac and Ctrl elsewhere.
- **`eventToKey`** reads `event.code` whenever Alt, Ctrl or Meta is held, per §15.
- **Keymap** (`keymap.default.ts`):
  - `bindings` and `aliases` are tables keyed by scope, where a scope is `"normal"` or `"normal:search"`.
  - User changes go in a `KeymapOverride` in which `null` removes an entry.
  - `effectiveKeymap()` merges the two.
  - Feature tables are merged in with `mergeScopes` (`keys/extend.ts`); later tables win per key.
- **Trie** (`trie.ts`):
  - `buildScopeTrie` adds the mode tables first, then the state tables.
  - `getTrie(override, mode, state)` is memoized per override object, so the override must be replaced, never mutated.
- **Parser** (`parser.ts`):
  - Leading digits become a count, unless the scope binds that digit or the parser is in a typing context (`counts: false`).
  - A sequence that is both complete and a prefix of a longer one returns `pending` with `ambiguous: true`. `y` (prefix of `ys`) is an example.
  - An ambiguous sequence resolves when the caller calls `flush()` after the timeout, or when the next key doesn't continue it.
  - Aliases expand once and resolve only to bindings (noremap).
  - Unmatched keys come back as `none` so typing contexts can insert them.
- **Hints:** `makeLabels` produces fixed-length labels, so no label is a prefix of another. `hintTargets` returns every non-hidden node on the current board; it does not clip to the viewport yet.

### Commands (`commands/`)

- **Changes** (`changes.ts`):
  - Doc changes are data: `tokens`, `delete`, `insert`, `paste`, `pasteStyle`, `setText`, `nudge`, plus `move`, `setProps` and `resetProps` from `extraChanges.ts`.
  - `applyChange(draft, change, ctx)` acts on the current focus and selection in `ctx`, not on stored ids, which is what lets `.` replay a change.
  - It returns `{ focus?, clearSelection? }`.
  - `forRepeat` strips fixed ids so a repeated insert creates fresh nodes.
- **Handlers** (`commands.ts`): `handlers` maps command id to `(count) => void`. The file also exports `typeChar`, which handles typed characters in Input and Text mode, plus `commitInput` and `fitBoard`.
- **Dispatch** (`dispatch.ts`):
  - `handleKeyDown` runs on window keydown. Events inside `[data-keydraw-ignore]` are skipped.
  - Hint mode captures keys before the parser sees them.
  - In Input mode, any command outside `input.*` and `nudge.*` commits pending tokens first.
  - `preventDefault` is called only for keys that were handled, so browser shortcuts like Ctrl-R still work.
  - `stateOf()` returns `"search"` while search is active. `run` ends search-active before any command other than `search.next` / `search.prev`.
- **Registry** (`registry.ts`): `COMMANDS` is a list of `{ id, title, group, description? }` for every implemented command.

### Move mode (`move-mode/`)

- **`move.ts`** is a pure reducer: `applyMove(draft, ids, steps, { gridSize })` returns the number of node moves.
  - Nested selections move only the outermost node; the artboard root never moves.
  - The rule is chosen per node by its *current* parent's layout, re-decided at every step, so outdenting into an absolute grandparent switches that node to grid moves.
  - Flex/grid: `↑`/`↓` move selected siblings as blocks (a block stops at the edge or at another selected node; Shift ×5). `←` outdents to just after the parent, keeping order. `→` indents each node into its nearest previous unselected sibling, skipping text nodes.
  - Absolute: `x`/`y` change by `gridSize` px per step (Shift ×10); `%` positions change by 1% per step. Missing `x`/`y` start at 0.
  - Grid snapping (decided): an off-grid px value spends its first step snapping to the nearest grid line in the direction of travel (x=13, grid 8: `→` gives 16, `←` gives 8). Only the axis being moved snaps.
  - Shift on `←`/`→` in flex/grid has no multiplier (the spec only multiplies reordering).
- **`session.ts`** keeps the session's steps in a module variable (not persisted). Each arrow appends a step (repeats of the same arrow merge into one step's `count`) and previews `{ type: "move", steps, gridSize }` from the committed doc. `Enter` commits it with `repeatable: true` (one undo step; `.` replays it on the current selection). `Esc` is `preview(null)`.
- **`commands.ts`:** `m` enters; the `move` scope binds arrows, Shift-arrows, `<CR>`, `<Esc>`.

### Attributes panel (`ui/`)

- **`attrs.ts`** is pure: `computeRows({ doc, draft, ids, defaults, all })`.
  - Configured rows are props a node sets that differ from its defaults (`defaultsFor` tries `span`, `shape`, `kind`, then `rect` as keys into `defaults.nodes`). `all` shows every registry prop.
  - Multi-select: a row is `mixed` when nodes disagree.
  - `pending` means draft ≠ doc for that prop, so live Input-mode tokens and inline edits highlight (amber) even when they equal the default.
  - Helpers: `defaultsFor` (also used by the `resetProps` reducer), `cycleRow`, `nudgeRow`, `breadcrumb`.
- **`AttributesPanel.tsx`:** breadcrumb, kind badge and name, rows of `name | value | token`. The last-touched prop has a left border; the keyboard row is `bg-accent`; default-valued rows (in `all` mode) are muted.
- **Keyboard (`attrsCommands.ts`):** `I` sets mode `attrs`. Row index and inline-edit state live in a separate tiny zustand store (`attrsPanelState.ts`), not persisted.
  - Writes use the new `setProps` change (`undefined` deletes). Nudges commit with merge key `attrs-nudge:<name>`, so a burst is one undo step.
  - `x` commits a `resetProps` change (decided): each selected node goes back to its *own* default, via `defaultsFor`; with no default the prop is deleted. `defaults.nodes` is captured in the change so the reducer stays pure and `.` repeats it.
  - Space on a non-toggleable row shows a message.
- **Inline edit** is an `<input data-keydraw-ignore>`, so the dispatcher skips it and it implements the typing-context rules itself: live preview per keystroke, `Enter` commits, `Esc` and blur revert, `Shift-Backspace` deletes a word, `Alt-↑/↓` nudge the last number in the text (±10 with Shift). Invalid text gets a red border and no preview.

### Store (`store/`)

- **One zustand store** (`useEditor`) built from slices, wrapped in `persist`. `S()` is shorthand for `useEditor.getState()`.
- **`doc` slice:**
  - `commit(change, { merge?, repeatable? })` uses `produceWithPatches` and pushes `{ patches, inverse }` onto `past`.
  - Commits with the same `merge` key inside one second merge into one entry; nudge bursts use this.
  - History depth comes from `defaults.editor.historyDepth`.
  - `preview(change | null)` sets `draft`, and the renderer shows `draft ?? doc`. Live Input-mode tokens, Text mode, Move mode and inline attribute edits all work this way. `Esc` is `preview(null)`, which leaves no history entry.
  - `setDoc` makes edits that skip history, such as switching boards.
- **`focus` slice:**
  - `setFocus` records `lastVisited` for every ancestor and switches boards when needed.
  - `repairFocus` falls back to the board root when focus points at a missing node, and drops missing ids from the selection.
- **`selection` slice:**
  - `selected` is the explicit selection; when it's empty, `selectionOf(s)` returns `[focus]`.
  - `selStack` frames store both the selection and the focus.
- **`mode` slice:**
  - mode state: `mode` and `prevMode`
  - pending keys and count
  - Input mode: `line` and `cycling`
  - Text mode: `text: { target, buffer, insert }`
  - `hint`, `lastTouched` (the nudge target) and `message`
- **`viewport` slice:** `{ x, y, zoom, fitted }`. The first open fits the board; after a reload the saved pan and zoom are kept.
- **`defaults` slice:** `builtinDefaults` holds:
  - `nodes` (initial props for each insert kind)
  - `placement`
  - `editor`: gridSize, zoomStep, historyDepth, whichKeyDelay, timeoutLen
  - `layout`: pane visibility and sizes

  `mergeDefaults` backfills keys added after a user's defaults were saved.
- **`config` slice:** `keymapOverride` and `settings: { search, attrs }`.
- **Persistence:** everything except uncommitted typing. Storage goes through `toStateStorage(localAdapter)`, which debounces writes and flushes on `beforeunload`.
  - Focus, selection and viewport are global for now, not per document as §16 says. That belongs to milestone 13 or whenever `:open` lands.

### Render (`render/`)

- **`Viewport`** applies the pan and zoom transform. Inside it, `ArtboardView` renders the root `NodeView` and then the overlays: `FocusLayer`, `HintLayer` and `TokenLine`.
- **`NodeView`:**
  - It is memoized per id and reads `draft ?? doc`. Immer's structural sharing keeps re-renders local.
  - `render/style.ts` builds the style for each node: `position`, `display`, every registry `toCss`, then the inline-span, shape and hidden overrides.
  - It shows a caret on the node being edited in Text mode.
- **Overlays** measure with `useBoxes`, a layout effect that re-measures when the doc, draft or zoom changes. Labels are counter-scaled by `1/zoom`. The focus ring's color depends on the mode.
- **`.kd-caret`** CSS lives in `App.tsx`.

### Search (`search/`)

- `match.ts` is pure: `nodeMatches` (name, kind, component, text; case-insensitive substring), `searchOrder` (current board, or all boards for `settings.search = "doc"`; hidden nodes skipped), `findMatches`, `nextAfter` (first match strictly after focus, wrapping).
- State lives in the `search` slice: `search: { line, query, active, matches, index, histPos, histDraft }` (not persisted) and `searchHistory` (persisted, capped at 100).
- Typing (`/`, mode `search`) recomputes `matches` per keystroke and `SearchLayer` highlights them live; focus doesn't move until `Enter`. `Esc` drops everything. `Enter` pushes history, focuses the first match after the current focus, and sets `active`. A query with no match says `no match: <q>`.
- While active, `n` / `#` (and `3` via the `normal:search` alias) step with wrap and count; `Esc` or any other command ends it. The status line shows `/query 2/5`.
- `↑` / `↓` in the search line walk history; `↓` past the newest restores what was typed.
- `:set search doc` isn't reachable until the command line exists (milestone 10); the setting is honoured already.
- Matching the artboard root: its `kind` is `frame`, so `/frame` includes it. Board names aren't matched (they aren't node names).

### Arrange (`arrange/`)

- **`arrange.ts`** has the pure reducers `wrapNodes`, `unwrapNodes`, `alignNodes` and `distributeNodes`. Measurements (`offsetBox`) are captured when the change is created and passed in, so reducers stay pure and `.` replays them.
- **Changes** (`extraChanges.ts`): `wrap`, `unwrap`, `align`, `distribute`. The extra reducer can now return `focus` / `clearSelection`.
- **Bindings:** `gw` wrap, `ga` + `l c r t m b` align, `gd` distribute. `arrange.unwrap` exists but has no key until `:unwrap` lands with the command line.
- **Wrap:** only nodes sharing the first node's parent. The frame takes the min `x`/`y` in an absolute parent and the children lose `x`/`y`.
- **Unwrap** puts children back in order; in an absolute parent they get `x`/`y` = frame position + measured offset.
- **Align/distribute** work in absolute parents only (flex/grid are laid out by the parent). Several nodes align to their shared bounds, one node aligns to its parent. `gd` needs 3+ nodes and picks the axis with the larger spread (decided; the spec names no axis).
- **Auto-wrap** (`input-mode/apply.ts`): a `flex:*` or `layout` token on several siblings of an absolute parent wraps them in a new frame first, then the token applies to that frame. Selections that are all of the parent's children still get wrapped (spec wording).

### Draw mode (`draw-mode/`)

- `s` enters with the focused node as the container (text and icon nodes are refused). Sketch state (`parent`, `cursor`, `anchor`) lives in a small zustand store (`state.ts`), not persisted.
- Cursor coordinates are in the container's padding box, like `x`/`y` props, starting at 0,0. Arrows step `gridSize` (Shift ×5, counts work) and clamp to the measured container.
- `Space` toggles the anchor; `region = regionOf(anchor, cursor)` is normalized and null when empty. `Esc` clears the anchor first, then exits.
- Shape keys `r e d t` commit a `draw` change (`extraChanges.ts`): a new last child of `parent` (one undo step, `.` repeats it). `w`/`h` come from the region; with no region the shape keeps its default size at the cursor. `x`/`y` are stored only in absolute parents (insertion rule). `diamond` uses the rect defaults. Default props are captured in the change.
- `v` selects the container's children fully inside the region.
- `l` and `a` say "not supported yet": there is no line or arrow node kind (arrow binding is milestone 13).
- `DrawLayer` renders the crosshair and the dashed region.

### Command line (`cmdline/`)

- `:` enters mode `command` (`;` is the default alias). `parseCmd`: if the first word is in `COMMAND_NAMES` it is a command, otherwise the whole line is a property-token line.
- Token lines preview live on the selection (same `tokens` change as Input mode); `Space` cycles the last toggleable token through `input-mode/cycle.ts`, which Input mode now shares. `Enter` commits, `Esc` reverts. `↑`/`↓` walk `cmdHistory` (persisted, capped at 100); `Tab` accepts the ghost text from `cmdline/complete.ts` (commands, subcommands, tokens, styles, components).
- `exec.ts` implements every command in §12. Notes:
  - `:open <doc>` matches by id, exact title, then title prefix. The open doc lives in the store; others are snapshots under `keydraw:doc:<id>` (doc, undo/redo, focus, selection, viewport) written by `io/docs.ts` on `:new` / `:open`.
  - `:board new [WxH|preset]`, `:board <WxH|preset>`; `:set place|grid|search|attrs`; `:name`, `:lock`, `:hide` (toggle) commit `name` / `flag` changes, so they are undoable.
  - `:map` / `:alias` take an optional mode first (`:map draw x draw.cancel`); `:unmap` / `:unalias` write `null` into the override. The override object is replaced, never mutated.
  - `:style save <name>` stores the focused node's tokens (without `x`/`y`) comma-joined. Names that collide with a token alias are refused. `tokenize()` expands named styles through `input-mode/styles.ts`, a module table kept in sync by the `styles` slice.
  - `:comp save <Name>` needs exactly one top-level node selected. Components are plain copies (§17.1 stays open) and insert through the existing `paste` change.
  - `:icon <name>` accepts any lucide name; with no name it opens the picker.
  - `:export yaml` downloads the artboard tree with token-form styles and arrows; `png` / `svg` use `html-to-image` on the artboard element.
  - `:defaults export` / `import` move defaults, styles, keymap and components as one YAML file (`io/yaml.ts`, `io/settings.ts`).

### Modals (`ui/`)

- One `modal` state in the `ui` slice (persisted: kind, section, row, scope). Mode is `modal` while navigating and `modal-text` while a filter, input line or picker query takes keys. A persisted open modal reopens on reload; its uncommitted typing is dropped.
- Handlers are in `modalCommands.ts`, dispatching on `modal.kind`; scopes `modal` and `modal-text` are in `modalBindings.ts`. `Esc` cancels typing, then drops an applied filter, then closes.
- **Defaults modal** (`:defaults [section]`): sections Rect, Ellipse, Text, Icon, Frame, Artboard, Placement, Shadow presets, Export, Editor, Layout. Row model and writes are in `defaultsRows.ts`. `←`/`→` switch sections, `Space` cycles, `Alt-↑/↓` nudge, `Enter` edits inline, `i` applies a token line to the node section (stays open and clears, like Input mode), `x` resets (global goes back to the built-in value; board scope drops the override), `/` filters across all sections, `Tab` flips global / this artboard for node defaults.
  - Per-artboard overrides live on `Artboard.overrides`; `effectiveDefaults()` lays them over the global node defaults for inserts, Draw mode, the attributes panel and `resetProps`.
  - Added to `Defaults`: `shadows` (the registry's `SHADOWS` table is mutated in sync by `syncShadows`) and `export` (`scale`, `background`). `scale` is the PNG/SVG pixel ratio; turning `background` off exports the artboard with a transparent background.
- **Keymap editor** (`:keys`): sections are modes, rows are effective bindings and aliases tagged default / user / removed. `i` adds `<keys> <commandId|keys>`, `x` removes a default (writes `null`) or drops a user entry.
- **Component loader** (`Alt-l`, `Shift-Alt-l` for a sibling) and **icon picker** (`Alt-i`): fuzzy query (`ui/fuzzy.ts`), `Enter` inserts per the insertion rule. Loader preview is a text outline, since the store's NodeView renders only the open doc.
- **Help** (`?`, `<mod-/>`, `:help`): `HelpPalette` from `@paladin/ui`, items from `COMMANDS` and the effective keymap (`helpShortcuts`: normal-mode key first, defaults before user additions).
- The dispatcher listens in the capture phase: the base-ui dialog popup would otherwise swallow keys while it has focus. The dialogs ignore their own `Esc`.

### Which-key, layers, arrows

- `WhichKey` shows the continuations of the pending prefix after `defaults.editor.whichKeyDelay`, from the same trie the parser uses, so user mappings and aliases appear.
- `LayerTree` (`Alt-t` toggles `layout.layerTree`): the artboard in reading order, lock and hide markers, focus and selection highlighted.
- Hidden nodes use `visibility: hidden`, not `display: none`, so layout and the focus ring still work; hints skip them. Locked nodes are skipped by delete, tokens, nudge, paste style, move, wrap and unwrap.
- **Arrows:** `Doc.arrows` (`model/binding.ts`). `a` + hint label commits an `arrow` change from every selected node to the target on the same artboard; ends are `{ node }` (re-measured on every render, so they follow moves) or free `{ x, y }` in artboard coordinates (Draw mode `l` / `a`, from the anchor to the cursor). Deleting a node prunes its arrows. `ArrowLayer` draws SVG lines clipped to the box edges.

## Behavior notes and decisions

- **Separating tokens in Input mode:** a comma separates tokens (`bold,w20`), since `Space` after a toggleable token cycles it. Decided: comma is the official separator.
- **Token forms:**
  - `name:value` and the space form `bg primary` are both accepted.
  - Bare `flex`, `grid` and `abs` set `layout`.
  - Bare enum and preset words take the first value; bare `shadow` is `base`, which cycles to `sm`, `md`, `lg`, `none`.
- **Layout from tokens:** any `flex:*` token turns the node into a flex container, and `grid:*` turns it into a grid. With several siblings selected, `layout` and `flex:*` apply to their parent. Auto-wrap is described under Arrange.
- **`%` sizes in absolute parents** resolve against the parent's content box (decided).
- **Exact restore (§16):** the store persists doc, undo/redo, focus, selection stack, viewport, defaults, keymap, styles, components, command and search history, and the open modal. Focus, selection and viewport are still global in the store, but each document's own copy is saved and restored by `:new` / `:open`. Not restored: pane focus (the editor reopens in Normal mode, which also covers the attributes panel).
- **Storage:** `hybridAdapter` writes to localStorage and moves a key to IndexedDB (`idb-keyval`) when it no longer fits; reads check both.
- **`gg`** goes to the first child of the artboard root (decided); `G` goes to the last node.
- **`c` and `Enter`** edit text only on text nodes; on anything else they show a message.
- **Empty spans:** committing an empty `o` span cancels it.
- **Nudge:**
  - In Input mode, nudge changes the number in the current token.
  - With no numeric token, it appends a token for the last-touched prop with the nudged value.
  - In Normal mode, it commits a `nudge` change on the last-touched prop. Only Input-mode commits set `lastTouched` so far; the attributes panel highlights it but does not set it.
- **Move mode:** focus and selection don't change while moving, and nudge keys are not bound in the `move` scope yet.

## Next up

All thirteen milestones are in. Known gaps:

- Draw mode `v` and the layer tree are keyboard-only: the tree does not take focus.
- Hint labels still cover every node on the artboard, not just the visible part of the viewport.
- Components are plain copies; no linked instances.
- Whole-document undo does not cover `setDoc` edits (board switching, title, artboard overrides), by design.

## Open questions (in addition to the spec's §17)

None open. Resolved: comma is the token separator; `%` uses the parent content box; `gg` lands on the first child; Move mode snaps on the first step; `x` resets each node to its own default.
