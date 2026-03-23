// @paladin/scribe-api/docs/BACKEND.md

# Scribe API — Backend Guide

Scribe's backend is a Bun + Hono server backed by SQLite via Drizzle ORM. It handles ticket persistence, prompt templates, file browsing, and fuzzy search across a codebase. Session Monitor (a sibling applet) pushes runtime state like `projectDir` and `recentFiles` into Scribe at startup and periodically thereafter.

## Directory Structure

```
src/
├── index.ts              # server entry — mounts all route modules, cors, port config
├── state.ts              # AppState singleton — in-memory session state
├── db/
│   ├── index.ts          # drizzle + bun:sqlite init, exports `db` and `schema`
│   └── schema.ts         # all table definitions (tickets, templates, fileGroups, sourceDirs, globalFilters)
├── lib/
│   ├── deepseek.ts       # deepseek() — generic LLM call, used by helpers
│   ├── helpers.ts        # determineTicketName(), determineTicketKeywords() — consume deepseek()
│   ├── tags.ts           # generateTags() — merges source-file-derived + keyword tags
│   ├── file-tree.ts      # walkDir(), safeRegex() — recursive dir traversal with include/exclude filters
│   └── fuzzy.ts          # fuzzySearch() — scored search across files, dirs, packages, file groups
└── routes/
    ├── tickets.ts        # CRUD + duplicate for tickets
    ├── templates.ts      # CRUD for prompt templates
    ├── file-groups.ts    # CRUD for saved file collections
    ├── files.ts          # file tree, scoped file reading, fuzzy search endpoint
    ├── config.ts         # source dir management, global include/exclude filters
    └── state.ts          # GET/PUT for projectDir and recentFiles (reads from AppState singleton)
```

## How Files Relate

The dependency flow is roughly:

```
index.ts
  └─ routes/*         (each route module is mounted as a Hono sub-app)
       ├─ db/         (all routes import `db` and `schema` for queries)
       ├─ state.ts    (state routes import the AppState singleton)
       └─ lib/*       (routes delegate business logic to lib modules)

lib/helpers.ts  →  lib/deepseek.ts      (helpers call deepseek for LLM tasks)
lib/tags.ts     →  lib/helpers.ts       (tag generation calls determineTicketKeywords)
lib/fuzzy.ts    →  lib/file-tree.ts     (fuzzy search uses walkDir to collect entries)
lib/fuzzy.ts    →  db/                  (loads file groups and source dir config)

routes/tickets.ts  →  lib/tags.ts       (generates tags on create and update)
                   →  lib/helpers.ts     (auto-names untitled tickets)
routes/files.ts    →  lib/file-tree.ts   (tree endpoint)
                   →  lib/fuzzy.ts       (search endpoint)
routes/config.ts   →  db/               (source dirs and global filters, pure CRUD)
```

## Key Design Decisions

### State: Class Singleton vs Database

`AppState` (`src/state.ts`) holds `projectDir` and `recentFiles` in memory. These are session-scoped values pushed by Session Monitor and don't need to survive a server restart — they'll be re-seeded on the next session. Everything else persists to SQLite.

### Tag Generation

Tags are derived automatically, never manually set. Two sources are merged:

1. **Source file paths** — a file at `~/projects/paladin/packages/foobar/src/thing.ts` produces the tag `@paladin/foobar`. This is pattern-matched in `lib/tags.ts`.
2. **Body keywords** — `determineTicketKeywords()` sends a truncated body to deepseek and gets back a JSON array of lowercase keyword strings.

Both run on ticket create (`POST /tickets`) and update (`PUT /tickets/:id`). There is no separate tag regeneration endpoint — it's always a side effect of save.

### Auto-Naming

When a ticket is created with the name "Untitled" (or no name), `determineTicketName()` calls deepseek to produce a short 3-8 word title from the body. This only happens on create, not update — once named, the name sticks unless manually changed.

### File Reading is Scoped

`GET /files/read?path=...` resolves the requested path and checks it falls within a configured source dir before reading. This prevents arbitrary filesystem access.

### Fuzzy Search Scoring

`lib/fuzzy.ts` implements a character-by-character fuzzy scorer with kind-based bonuses:

| Kind      | Bonus |
|-----------|-------|
| group     | +300  |
| package   | +200  |
| directory | +50   |
| file      | +0    |

This ensures file groups and packages (dirs inside a `packages/` folder) surface first, matching the spec. The scoring function itself is intentionally simple — replace `fuzzyScore()` with a better algorithm (fuse.js, fzf-style) when needed without touching anything else.

### File Tree Filtering

`walkDir()` in `lib/file-tree.ts` accepts four regex patterns: per-dir include, per-dir exclude, global include, global exclude. Exclude always wins over include. The patterns are stored as strings in the database and compiled to RegExp at query time via `safeRegex()`.

Defaults (seeded in `globalFilters`):
- **Include**: `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.lua`, `.sh`
- **Exclude**: `node_modules`, `dist`, `build`, config files, lockfiles, images

### Templates

Pure CRUD. Templates have a `key` (primary key, can be user-provided or auto-generated) and contain `name` + `content`. The frontend handles template transformation (replacing `{{instructions}}` and `{{source-files}}` placeholders) — the backend just stores them.

## Adding a New Route Module

1. Create `src/routes/your-thing.ts` exporting a `new Hono()` app
2. Mount it in `src/index.ts`: `app.route("/your-thing", yourThing)`
3. If it needs new tables, add them in `db/schema.ts` and run migrations
4. If it needs shared logic, put it in `lib/` — keep routes thin

## Environment Variables

| Variable           | Default                                          | Description               |
|--------------------|--------------------------------------------------|---------------------------|
| `DEEPSEEK_URL`     | `https://api.deepseek.com/v1/chat/completions`   | LLM endpoint              |
| `DEEPSEEK_API_KEY` | (empty)                                          | API key for deepseek      |
| `DEEPSEEK_MODEL`   | `deepseek-chat`                                  | Model identifier          |

## Database

SQLite via `bun:sqlite`, WAL mode enabled. The database file is `scribe.db` in the working directory. Drizzle handles schema and queries. The `globalFilters` table uses a singleton row pattern (id is always `"singleton"`).
