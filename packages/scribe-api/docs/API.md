// @paladin/scribe-api/docs/API.md

# Scribe API — Frontend Integration Reference

Base URL: `http://localhost:4800`

All request/response bodies are JSON. Dates are ISO 8601 strings serialized from timestamps.

---

## Tickets

A ticket is the core unit of work — a long-form task or issue with associated source files.

### Data Shape

```ts
type Ticket = {
  id: string
  name: string                    // auto-generated from body if "Untitled" on create
  body: string
  templateKey: string | null
  status: "active" | "archived" | "suspended" | "completed"
  tags: string[]                  // auto-generated on create and update, never set manually
  sourceFiles: string[]           // absolute paths of bookmarked files
  createdAt: string
  modifiedAt: string
}
```

### `GET /tickets`

List tickets. All query params are optional and combinable.

| Param    | Type   | Description                              |
|----------|--------|------------------------------------------|
| `status` | string | Filter by status                         |
| `tag`    | string | Filter to tickets containing this tag    |
| `q`      | string | Substring search across name and body    |

Returns `Ticket[]`, sorted by `modifiedAt` descending.

### `GET /tickets/:id`

Returns a single `Ticket` or `404`.

### `POST /tickets`

Create a ticket. The backend handles two things automatically:
- If `name` is omitted or `"Untitled"`, it calls an LLM to derive a name from the body.
- `tags` are generated from `sourceFiles` paths (extracting package scopes like `@paladin/foobar`) and from the body via LLM keyword extraction.

You never send `tags` — they're always computed.

| Field          | Type     | Required | Default      |
|----------------|----------|----------|--------------|
| `name`         | string   | no       | derived      |
| `body`         | string   | no       | `""`         |
| `templateKey`  | string   | no       | `null`       |
| `status`       | string   | no       | `"active"`   |
| `sourceFiles`  | string[] | no       | `[]`         |

Returns the created `Ticket` with `201`.

### `PUT /tickets/:id`

Partial update. Send only the fields you want to change. Tags are regenerated on every update from the current body and sourceFiles. Returns the updated `Ticket` or `404`.

### `DELETE /tickets/:id`

Deletes the ticket. Returns `{ ok: true }` or `404`.

### `POST /tickets/:id/duplicate`

Creates a new ticket cloned from the given one. The name gets a `(copy)` suffix. Status resets to `"active"`. Returns the new `Ticket` with `201`.

### Frontend Responsibilities

- **Auto-save**: the frontend tracks dirty state (body changed or sourceFiles changed) and calls `PUT` periodically (every 5 minutes) and on tab departure.
- **Manual save**: `cmd + s` triggers an immediate `PUT`.
- **Dirty indicator**: show when unsaved changes exist.
- **Open ticket**: `cmd + o` opens a picker, loads via `GET /tickets/:id`, and hydrates all state (body, sourceFiles, templateKey, etc.).
- **New from existing**: use `POST /tickets/:id/duplicate`, then navigate to the new ticket.

---

## Templates

Prompt templates with placeholder support. The backend stores them; the frontend handles transformation.

### Data Shape

```ts
type Template = {
  key: string             // stable identifier, used as templateKey on tickets
  name: string            // display name
  content: string         // template body with {{instructions}} and {{source-files}} placeholders
  createdAt: string
  modifiedAt: string
}
```

### `GET /templates`

Returns `Template[]`.

### `GET /templates/:key`

Returns a single `Template` or `404`.

### `POST /templates`

| Field     | Type   | Required | Default          |
|-----------|--------|----------|------------------|
| `key`     | string | no       | auto-generated   |
| `name`    | string | yes      |                  |
| `content` | string | yes      |                  |

Returns the created `Template` with `201`.

### `PUT /templates/:key`

Partial update. Returns the updated `Template` or `404`.

### `DELETE /templates/:key`

Returns `{ ok: true }` or `404`.

### Default Template

The frontend should ship a built-in default template (not persisted to the backend):

```
{{source-files}}
{{instructions}}
```

### Frontend Responsibilities — Template Transformation

Transformation happens client-side. Two modes based on submit type:

**Clipboard / Task mode:**
- `{{instructions}}` → `<instructions>{textarea content}</instructions>`
- `{{source-files}}` → one `<source-file path="{path}">{content}</source-file>` block per bookmarked file

**Preview mode:**
- Same transformation as clipboard, then render as HTML in a modal.
- Instructions render in an instructions section.
- Source files render without content, as pill items in a grid layout.

---

## File Groups

Saved collections of source files. These appear in the fuzzy picker alongside regular files and directories, and rank highest in search results.

### Data Shape

```ts
type FileGroup = {
  id: string
  name: string
  files: string[]         // absolute paths
  createdAt: string
}
```

### `GET /file-groups`

Returns `FileGroup[]`.

### `GET /file-groups/:id`

Returns a single `FileGroup` or `404`.

### `POST /file-groups`

| Field   | Type     | Required | Default           |
|---------|----------|----------|-------------------|
| `name`  | string   | no       | `"Unnamed Group"` |
| `files` | string[] | yes      |                   |

If no name is provided, the frontend should derive it from the current ticket name before sending.

Returns the created `FileGroup` with `201`.

### `PUT /file-groups/:id`

Partial update of `name` and/or `files`. Returns the updated `FileGroup` or `404`.

### `DELETE /file-groups/:id`

Returns `{ ok: true }` or `404`.

---

## Files

File system browsing, reading, and search — scoped to configured source directories.

### `GET /files/tree`

Returns the full file tree for all visible source dirs, with include/exclude filters applied.

```ts
type FileEntry = {
  path: string
  name: string
  type: "file" | "directory"
  children?: FileEntry[]
}
```

Returns `FileEntry[]` — one root entry per visible source dir.

The frontend handles merging these entries into the file tree panel, deduplicating, and nesting directories that share the same branch.

### `GET /files/read?path={absolutePath}`

Read a single file's content. The path must fall within a configured source dir or the request returns `403`.

Returns `{ path: string, content: string }`.

### `GET /files/search?q={query}`

Fuzzy search across all visible source dirs and file groups.

Returns scored results:

```ts
type ScoredResult = {
  item: FileEntry | FileGroup
  score: number
  kind: "group" | "package" | "directory" | "file"
}
```

Results are pre-sorted by score descending, capped at 50. The `kind` field tells you what you're dealing with — use it for display (icons, labels, grouping in the picker).

**Ranking priority**: groups > packages > directories > files. Within the same kind, fuzzy match quality determines order.

### Frontend Responsibilities

- **Fuzzy picker** (`j` to open): calls `GET /files/search?q=...` on each keystroke (debounced). Supports multiple sequential picks. `cmd + enter` or close button to dismiss. `esc` negates.
- **Adding items**: when a file is picked, add it to the tree. When a directory is picked, add it and all children. Merge into existing tree — no duplicates. Directories sharing branches should nest.
- **File reading**: when a file needs to be displayed in the file viewer, call `GET /files/read?path=...` to get its content.

---

## Config

Manages source directories and global file filters. These persist across sessions.

### Source Dirs

```ts
type SourceDir = {
  id: string
  path: string
  include: string | null    // regex pattern, e.g. "\\.tsx?$"
  exclude: string | null    // regex pattern, e.g. "test|spec"
  visible: boolean          // controls whether it appears in tree/search
}
```

### `GET /config/source-dirs`

Returns `SourceDir[]`.

### `POST /config/source-dirs`

| Field     | Type    | Required | Default |
|-----------|---------|----------|---------|
| `path`    | string  | yes      |         |
| `include` | string  | no       | `null`  |
| `exclude` | string  | no       | `null`  |
| `visible` | boolean | no       | `true`  |

Returns the created `SourceDir` with `201`.

### `PUT /config/source-dirs/:id`

Partial update. Returns updated `SourceDir` or `404`.

### `DELETE /config/source-dirs/:id`

Returns `{ ok: true }` or `404`.

### Global Filters

```ts
type GlobalFilters = {
  id: "singleton"
  include: string       // regex, e.g. "\\.tsx?$|\\.py$"
  exclude: string       // regex, e.g. "node_modules|dist"
}
```

### `GET /config/global-filters`

Returns the global filters. Seeds defaults on first access if not yet present.

**Defaults:**
- include: `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.lua`, `.sh`
- exclude: `node_modules`, `dist`, `build`, config files, lockfiles, images

### `PUT /config/global-filters`

Replace global filters. Send both `include` and `exclude`.

Returns the updated `GlobalFilters`.

### Frontend Responsibilities

The fuzzy picker has a second tab for source dir config. Each dir entry shows:
- A visibility toggle (maps to `visible`)
- Include and exclude regex fields (per-dir)
- A section for global include/exclude patterns

The default first dir should be seeded from `state.projectDir` on first launch.

---

## State

Session-scoped values managed by Session Monitor. These are in-memory on the backend — they don't survive a server restart and will be re-pushed by Session Monitor on the next session.

### `GET /state/project-dir`

Returns `{ projectDir: string }`.

### `PUT /state/project-dir`

Send `{ projectDir: string }`. Used by Session Monitor to set the working directory.

### `GET /state/recent-files`

Returns `{ recentFiles: string[] }`.

### `PUT /state/recent-files`

Send `{ recentFiles: string[] }`. Session Monitor pushes updates here periodically.

### Frontend Responsibilities

- On startup, fetch `GET /state/project-dir` to seed the initial source dir if none are configured.
- Fetch `GET /state/recent-files` to populate the "recent" label group in the file tree. Re-fetch when Session Monitor pushes updates (poll or use a notification mechanism).

---

## Error Shape

All error responses follow:

```ts
{ error: string }
```

Common status codes: `400` (bad request), `403` (path outside source dirs), `404` (not found).

---

## Quick Reference

| Method | Endpoint                    | Purpose                          |
|--------|-----------------------------|----------------------------------|
| GET    | `/tickets`                  | list tickets (filterable)        |
| GET    | `/tickets/:id`              | get ticket                       |
| POST   | `/tickets`                  | create ticket (auto-name + tags) |
| PUT    | `/tickets/:id`              | update ticket (re-tags)          |
| DELETE | `/tickets/:id`              | delete ticket                    |
| POST   | `/tickets/:id/duplicate`    | clone ticket                     |
| GET    | `/templates`                | list templates                   |
| GET    | `/templates/:key`           | get template                     |
| POST   | `/templates`                | create template                  |
| PUT    | `/templates/:key`           | update template                  |
| DELETE | `/templates/:key`           | delete template                  |
| GET    | `/file-groups`              | list file groups                 |
| GET    | `/file-groups/:id`          | get file group                   |
| POST   | `/file-groups`              | create file group                |
| PUT    | `/file-groups/:id`          | update file group                |
| DELETE | `/file-groups/:id`          | delete file group                |
| GET    | `/files/tree`               | full file tree                   |
| GET    | `/files/read?path=...`      | read file content                |
| GET    | `/files/search?q=...`       | fuzzy search                     |
| GET    | `/config/source-dirs`       | list source dirs                 |
| POST   | `/config/source-dirs`       | add source dir                   |
| PUT    | `/config/source-dirs/:id`   | update source dir                |
| DELETE | `/config/source-dirs/:id`   | remove source dir                |
| GET    | `/config/global-filters`    | get global filters               |
| PUT    | `/config/global-filters`    | update global filters            |
| GET    | `/state/project-dir`        | get project dir                  |
| PUT    | `/state/project-dir`        | set project dir                  |
| GET    | `/state/recent-files`       | get recent files                 |
| PUT    | `/state/recent-files`       | set recent files                 |
