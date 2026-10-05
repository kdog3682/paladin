# keydraw — spec

A keyboard-only layout/design canvas. Figma-style auto-layout (frames, padding, flex, components) driven by a vim-style modal grammar and Tailwind-like property tokens. No mouse required.

Stack: Bun, TypeScript, React, shadcn (`@paladin/shadcn`; components and helpers such as `cn` are imported from it), zustand. Icons: `lucide-react`. Export: `html-to-image`, `yaml`.

---

## 1. Model

```
Doc → Artboard[] → Node tree
Node = frame | text | icon | instance
```

- Every node can have children. Layout is `absolute` (positioned in parent), `flex` or `grid`.
- Text inside a container is a `span` child (inline). Standalone text blocks are `text` nodes.
- Sizes: px, `%` of the parent's content box (after padding), `fill`, `hug`.
- Each artboard has a size (`1440x900`, presets like `mobile`) and is its own canvas. The artboard is the root node of its tree.
- Nodes may have a `name` (shown in hints, layer tree, search, YAML).
- Documents may be untitled. An untitled document is named with its creation timestamp (e.g. `2026-10-05 14:32`) until renamed. Documents autosave.

## 2. Rendering

- HTML divs, not SVG or canvas. The browser does the box model, flex and grid.
- Each artboard is rendered as a fixed-size element inside a pannable, zoomable viewport.
- Overlay layers: focus ring, selection outlines, Draw-mode cursor/region, `f` hint labels, search-match highlights, grid, Input-mode token line.

## 3. Property registry (central)

One table drives the Input-mode parser, autocomplete, attributes panel, defaults modal and YAML.

```ts
type PropDef = {
  /* canonical name, e.g. "padding" */
  name: string
  /* short tokens, e.g. ["p"] */
  aliases: string[]
  kind: "length" | "number" | "color" | "enum" | "bool" | "preset"
  /* allowed units for length props */
  units?: ("px" | "%")[]
  /* enum/preset values for autocomplete and Space-cycling.
     enum, bool, preset and color props are toggleable: Space cycles them
     in Input mode, the command line, the attributes panel and the defaults modal */
  values?: string[]
  parse: (raw: string) => unknown
  toCss: (v: unknown) => React.CSSProperties
}
```

Initial props: `p px py pt pr pb pl`, `w h` (px, %, fill, hug), `x y` (absolute parents only), `r` (radius), `gap`, `bg`, `fg`, `border`, `op` (opacity), `z`, `shadow` (`shadow`, `shadow:lg`, `shadow:none`), `flex:dir row|col`, `flex:align start|center|end|apart|around|evenly`, `flex:wrap`, `grid:cols <n>`, `grid:rows <n>`, `span:col <n>`, `span:row <n>`, `text:sm|md|lg|xl`, `bold`, `align:left|center|right`.

Colors accept raw values or theme tokens (`primary`, `muted`, …) mapped to shadcn CSS vars.

## 4. Focus and selection

- **Focus:** there is always exactly one **focused** node, the current element. Arrows move focus (§5). Focus never disappears; at the top of the tree it rests on the artboard.
- **Selection:** the set of nodes that operators and Input mode act on.
  - By default the selection is **just the focused node**, so there is no separate "select" step for single-element work.
  - Explicit multi-select:

    | Key | Action |
    |---|---|
    | `Space` | toggle the focused node in the selection |
    | `Shift-↑` / `Shift-↓` | extend the selection to the previous / next sibling (range select) |
    | `vv` | expand: all siblings, then the parent, …, pushing onto a selection stack |
    | `v-` | shrink: pop the selection stack |
    | `Esc` | clear the explicit selection, back to just the focused node |

  - **Targeting the artboard** (e.g. to insert at the top level): press `←` until focus reaches the artboard.

## 5. Modes

| Mode | Enter | Purpose |
|---|---|---|
| Normal | `Esc` | navigation and operators |
| Input | `i` | type property tokens, live-applied (§8) |
| Move | `m` | move, reorder, indent and outdent the selection (§7) |
| Text | `c`, `o` / `O`, or `Enter` on a text node | edit a node's text |
| Draw | `s` | sketch a region inside the focused container (§9) |
| Command | `:` (default alias `;`) | doc-level commands |
| Search | `/` | find and jump to a node (§10) |

All keys in this spec are **default bindings**. Every one is remappable, and key-to-key aliases are supported (§15).

**Typing contexts** follow the same rules everywhere: Input-mode token line, command line, search line, Text mode, and inline edits in the attributes panel and defaults modal.

| Key | Effect |
|---|---|
| `Enter` | commit. Input mode stays open after committing; the command and search lines close; Text mode returns to the previous mode (`Shift-Enter` inserts a newline) |
| `Esc` | clear: cancel and revert every uncommitted live change. Nothing is propagated or added to history. In Input mode, `Esc` on an empty line exits to Normal |
| `Shift-Backspace` (Mac `Shift-Delete`) | delete the previous word or token |

**Nudge** works in every mode:

| Key | Effect |
|---|---|
| `Alt-↑` / `Alt-↓` | ±1 on the active numeric value |
| `Shift-Alt-↑` / `Shift-Alt-↓` | ±10 on the active numeric value |

The active value is the current token in Input mode, the focused row in the attributes panel, and otherwise the last-touched numeric property of the selection (highlighted in the attributes panel). Outside a typing context, each nudge burst is one undo step.

## 6. Normal mode

There are no `hjkl` motions. Arrows move focus like a file tree. Counts work (`3↓`).

| Key | Action |
|---|---|
| `↑` / `↓` | previous / next sibling |
| `←` | parent |
| `→` | drill in to a child (the last-visited child of that node, or else the first child) |
| `w` / `b` | next / previous node in reading order |
| `f` + label | hint-jump to a visible node |
| `/` + query | search (§10); `n` / `#` next / previous match |
| `gg` / `G` | first / last node |

**Operators** (act on the selection):

| Key | Action |
|---|---|
| `x` / `dd` | delete |
| `y` / `p` / `P` | yank / paste as last child / paste as next sibling |
| `ys` / `ps` | yank style / paste style |
| `u` / `Alt-r` (alias `r`) | undo / redo |
| `.` | repeat the last change, including the last Input-mode commit |
| `ga` + `l c r t m b` | align |
| `gd` | distribute |
| `a` + `f`-label | arrow from selection to target (bound, follows moves) |
| `o` | insert a text `span` as the last child of the focused node and enter Text mode |
| `O` | insert a text `span` as a sibling after the focused node and enter Text mode |
| `gw` | wrap the selection in a new frame (inverse of `:unwrap`) |

**Inserting:** see §9, insertion rule.

**Viewport:** `+` / `-` / `=` zoom; `zz` center on focus; `zf` fit; `Alt-d u e y` pan; `gt` / `gT` next / previous artboard; `zo` artboard overview.

**Other:** `Alt-l` opens the component loader (`Shift-Alt-l` inserts as a sibling, per §9); `?` or `mod+/` opens the help palette.

## 7. Move mode

`m` acts on the selection. `Enter` commits as one undo step; `Esc` reverts. Counts work (`5↓`).

| Parent layout | Arrows | `Shift` + arrows |
|---|---|---|
| flex / grid | `↑` / `↓` reorder among siblings; `←` outdent (become the parent's next sibling); `→` indent (become the last child of the previous sibling) | same, ×5 for reordering |
| absolute | move 1 grid step in that direction | move 10 grid steps |

## 8. Input mode

`i` acts on the selection. An empty token line floats beside the focused node and is mirrored in the status line. Current values are shown in the attributes panel (§11), not pre-filled into the line.

**Token grammar:**

```
token := alias number ["p"]       e.g. p2, w20, w20p, h100p, gap8, pt4
       | word[:value]             e.g. shadow, shadow:lg, bg primary, flex:align apart
```

- Numbers are px. A `p` directly after digits means `%` (`w20p` = 20%). Use `Space` to separate tokens, so `w20 p4` is width then padding.
- Alias letters use longest match against the registry (`pt4` = top padding).
- **Live apply** as you type: `w2` → `w20` updates in place.
- **`Space` cycles toggleable tokens.** A token is toggleable if its kind is `enum`, `bool`, `preset` or `color`. When the last token is toggleable, `Space` cycles its values live (`shadow` → `shadow:sm` → `shadow:md` → `shadow:lg` → `shadow:none`; `bold` on/off; colors through the theme palette). `Shift-Space` cycles backward. Typing any other key commits the cycled value and starts a new token.
- For other tokens, `Space` ends the token. `Backspace` edits the current token, and removing a token reverts its value.
- `Alt-↑` / `Alt-↓` nudge the current token's number (±10 with `Shift`).
- Autocomplete shows ghost text from the registry, named styles, icons and component names; `Tab` accepts.
- `Enter` commits the line as **one undo step**, clears it, and **stays in Input mode**.
- `Esc` reverts uncommitted tokens; `Esc` on an empty line exits to Normal.
- **Arrow keys never move a text caret here; they move focus**, the same as in Normal mode. Pending tokens are committed first, so you can style element after element without leaving Input mode. `Shift-↑` / `Shift-↓` extend the selection as in §4.

**Flex:** with several siblings selected, `flex:...` tokens apply to their parent. If the parent isn't flex, the siblings are auto-wrapped in a new flex frame (`:unwrap` reverses this).

## 9. Draw mode and insertion

`s` shows a crosshair cursor inside the focused container. Arrows move the cursor (`Shift` ×5). `Space` sets the anchor; arrows then stretch a region. A shape key commits it:

| Key | Shape |
|---|---|
| `r` | rect (frame) |
| `e` | ellipse |
| `d` | diamond |
| `l` | line |
| `a` | arrow |
| `t` | text |
| `v` | select (instead of drawing, select every node inside the region) |

Quick-create in Normal mode with default size: `R`, `E`, `T`.

**Insertion rule:** this applies to every way of adding a node: quick-create, Draw mode, the component loader, icons and `o` spans.

- The new node is appended as the **last child of the focused node**. The `Shift` variant (`O`, `Shift-Alt-l`, …) inserts it as a sibling after the focused node instead.
- **Flex/grid parent:** the parent's layout positions the node (direction, gap, columns). No coordinates are stored.
- **Absolute parent:** the node is placed next to the previous child, following `:set place right|below`, or at the Draw-mode region.
- The new node receives focus afterwards.

## 10. Search

`/` opens a search line (a typing context).

- **Matches:** case-insensitive substring against node name, kind, component name and text content. Example: `/button`.
- Matches highlight live while typing. `Enter` focuses the first match after the current focus, then closes the line.
- `n` goes to the next match and `#` to the previous one; both wrap around. The status line shows the position, e.g. `2/5`.
- **Search-active state:** lasts from `Enter` until `Esc` or any command other than `n`, `#` or `3`.
- **Scope:** the current artboard. `:set search doc` searches all artboards, and a jump switches artboards.
- `↑` / `↓` in the search line walk search history.

## 11. Attributes panel

A side panel (visibility and width set in the Layout defaults) that always reflects the focused node, or the selection if more than one node is selected.

- **Header:** breadcrumb path (`Artboard › card › button`), plus the node's kind and name.
- **Rows:** only the **configured** attributes, meaning values that differ from defaults. Each row shows the name, value and token form, e.g. `padding 4px p4`.
  - `:set attrs all` shows every property instead.
  - With multiple nodes selected, rows show shared values and mark mixed ones.
  - The last-touched numeric property (the nudge target) is highlighted.
- **Live:** pending Input-mode tokens appear highlighted until committed or reverted.
- **Focus with `I`:**
  - `↑` / `↓` move between rows.
  - `Space` toggles or cycles.
  - `Alt-↑` / `Alt-↓` nudge.
  - `Enter` edits inline.
  - `x` resets a row to its default.
  - `Esc` returns focus to the canvas.

## 12. Command line (`:`)

`:` is the canonical command line; `;` is a default alias for it. It has autocomplete and `↑` / `↓` history.

Besides doc-level commands, it accepts **property tokens** using the same parser as Input mode, applied to the selection. Space-cycling works the same way, with live preview: `:shadow` then `Space` steps through the shadow presets, `Enter` applies, and `Esc` reverts.

| Command | Effect |
|---|---|
| `:new` / `:open <doc>` / `:rename <name>` | create (untitled, timestamped) / open / rename a document |
| `:defaults [section]` | open the defaults modal (§13) |
| `:keys` | open the keymap editor (same modal layout) |
| `:board new` / `:board 1440x900` / `:board mobile` | create / resize artboard |
| `:comp save <Name>` | save selection as a component |
| `:style save <name>` | save the selection's tokens as a named style, usable as a token in Input mode |
| `:icon <name>` | insert icon |
| `:name <name>` | name the focused node |
| `:set <key> <value>` | misc settings (e.g. `place`, `grid`, `search`, `attrs`) |
| `:unwrap` / `:lock` / `:hide` | node utilities |
| `:export yaml` / `:export png` / `:export svg` | export current artboard |
| `:defaults export` / `:defaults import` | move defaults, styles, keymap and components as one YAML file |
| `:help` | open the help palette (§15) |

## 13. Defaults modal

shadcn Dialog reusing the attributes-panel row component. **Every** configurable value lives here: node defaults, editor settings and UI layout.

- **Left column, sections:** Rect, Ellipse, Text, Icon, Frame, Artboard, Placement, Shadow presets, Export, Editor (grid size, zoom step, history depth, which-key delay), Layout (pane sizes and visibility: attributes panel, layer tree, token line, status line). Switch sections with `←` / `→`.
- **Right column, rows:**
  - `↑` / `↓` move between rows.
  - `Space` toggles booleans and cycles enums and colors.
  - `Alt-↑` / `Alt-↓` nudge.
  - `i` enters Input mode scoped to the section (e.g. `w20p h100p` on Rect).
  - `x` resets a row.
  - `/` filters rows across all sections.
- A live preview swatch shows the section's defaults.
- **Scope:** global, or per-artboard overrides that fall back to global.
- Built-in defaults: rect `w20% h100%`, inset (padding) `5`.
- Changes save immediately.

## 14. Components and icons

- **Components** are saved node subtrees. `Alt-l` opens the loader: a shadcn Command palette with fuzzy search and preview. The chosen component is injected as a child of the focused node (insertion rule, §9) and respects the parent's flex or grid.
  - v1: inserting a component makes a plain copy. Linked instances are an open question (§17).
- **Icons:** a curated `lucide-react` catalog (about 60: chevrons, x, check, plus, search, menu, user, settings, trash, edit, …). Icon nodes take `w`, `h` and `fg`.

## 15. Keymap and aliases

Two layers, modeled on vim:

- **Bindings** map key sequences to **command IDs** (data, not functions), e.g. `vv` → `select.expand`, `v-` → `select.shrink`, `Alt-l` → `component.loader`.
- **Aliases** map keys to other keys, non-recursively (like vim `noremap`), e.g. `;` → `:`.
- Both are scoped to a mode, and optionally to a **state** within it (e.g. search-active).

Resolution: an alias is expanded once, then the result is looked up in the bindings.

- `keymap.default.ts` ships the defaults: every key in this spec, plus these aliases:
  - `;` → `:`
  - `r` → `Alt-r` (Normal mode, so `u` / `r` are undo / redo)
  - `3` → `#` (**search-active only**, so `3` stays a count prefix the rest of the time)
- **Browser-reserved keys:** any default that a browser shadows (`Cmd/Ctrl` + `l r d u e y t w n`, `Alt` + `←` / `→`, …) uses `Alt` + letter instead. Match `Alt` combos on `event.code` (e.g. `KeyL`), not `event.key`, because macOS turns `Alt+letter` into special characters.
- **Command registry** (`commands/registry.ts`): every command ID has `{ id, title, group, description? }`. The help palette, which-key, `:map` autocomplete and the `:keys` editor all read from it.
- User changes go in an override layer in the `config` slice, persisted to localStorage, and replace defaults key by key.
- Commands:
  - `:map [mode] <keys> <commandId>` / `:unmap [mode] <keys>`
  - `:alias [mode] <lhs> <rhs>` / `:unalias [mode] <lhs>`
  - `:keys` opens the editor modal.
- A which-key popup lists continuations after a prefix (`g`, `z`, `v`, …), showing user mappings and aliases too.
- **Help palette:** use the existing `HelpPalette` from `@paladin/ui` (don't rebuild it). Items are generated from the command registry plus the *effective* keymap (defaults + user overrides + aliases):
  - `group` = mode or command group
  - `title` / `description` from the command registry
  - `shortcut` = the resolved key sequence
  - keydraw owns the open state and the hotkeys (`?`, `mod+/`, `:help`)

## 16. State, history, persistence

- **zustand slices:** `doc`, `focus` (focused node plus last-visited child per parent), `selection` (plus selection stack), `mode` / `pending`, `search`, `viewport`, `defaults`, `styles`, `components`, `config`.
- **Commands are data.** Doc changes go through reducers with immer patches, which gives undo/redo, `.` repeat and future macros. Focus, selection and viewport changes are not undoable.
- **Persistence:** zustand `persist` behind a `StorageAdapter` interface (`load`, `save`, `list`), with `localAdapter` in v1 and a backend later. localStorage is capped at about 5MB; an IndexedDB adapter (`idb-keyval`) is the fallback.
- **Exact restore on refresh.** Reloading the page restores everything exactly as it was:
  - per document: the full undo/redo stack (persisted patches), the current artboard, focus, selection and selection stack, and viewport (pan and zoom)
  - globally: the open document, panes (sizes, visibility, focus), open modal and its section/row, and command-line and search history
- Uncommitted typing is the one exception. Like `Esc`, it is dropped, and the editor reopens in Normal mode.
- History depth is capped by a setting in the defaults modal (Editor section).

## 17. Open questions

1. Components: plain copies (v1) or linked instances with overrides?
2. Negative values (`m-4`)?
3. Should `i` with focus on nothing but the artboard edit defaults directly, or always route through `:defaults`?
4. Is `%` allowed for radius (`r20p`)?

## 18. File layout

```
@paladin/keydraw/src/
  model/       types.ts tree.ts placement.ts geometry.ts binding.ts
  props/       registry.ts parse.ts presets.ts
  keys/        keymap.default.ts trie.ts parser.ts hints.ts
  input-mode/  tokenize.ts apply.ts complete.ts nudge.ts
  move-mode/   move.ts
  search/      match.ts search.ts
  cmdline/     parse.ts exec.ts complete.ts history.ts
  commands/    registry.ts commands.ts history.ts
  store/       useEditor.ts slices/{doc,focus,selection,mode,search,viewport,defaults,styles,components,config}.ts
  storage/     adapter.ts localAdapter.ts
  render/      Viewport.tsx ArtboardView.tsx NodeView.tsx FocusLayer.tsx DrawLayer.tsx HintLayer.tsx GridLayer.tsx TokenLine.tsx
  ui/          StatusLine.tsx CmdLine.tsx SearchLine.tsx AttributesPanel.tsx DefaultsModal.tsx KeymapModal.tsx ComponentLoader.tsx IconPicker.tsx WhichKey.tsx LayerTree.tsx
  io/          yaml.ts image.ts
  icons/       catalog.ts
  App.tsx
```

## 19. Milestones

1. Tree model, store, artboard render, focus ring, status line, **property registry**.
2. Key trie and parser (counts, pending state, mode/state-scoped bindings and aliases), with unit tests.
3. Tree navigation with arrows, selection (`Space`, `Shift-↑` / `Shift-↓`, `vv` / `v-`), `f` hints.
4. Insertion rule, quick-create, `o` / `O`, delete, yank, paste, undo/redo.
5. Input mode: tokens, live apply, stay-after-`Enter`, arrow navigation while typing, autocomplete, nudge.
6. Move mode: reorder, indent and outdent, absolute moves.
7. Attributes panel.
8. Search: `/`, `n` / `#`, highlights.
9. Flex/grid tokens with auto-wrap/unwrap, align and distribute; Draw mode.
10. Command line, defaults modal.
11. Components, named styles, icons, `Alt-l` loader.
12. Export (YAML, PNG, SVG), settings import/export, keymap editor, which-key, `:help`.
13. Polish: arrows with binding, `.` repeat, layer tree, lock and hide, exact restore on refresh.
