# scaffold

Turns a set of author-provided source files into a fully bootstrapped project on disk — workspace packages, manifests, dependencies, and git.

## How it works

### 1. Parse (`prepare`)

Each content string must start with a path header comment:

```ts
// @mathpenny/utils/index.ts
export function greet(name: string) { ... }
```

`prepare` strips the header, resolves the path to an absolute location under `baseProjectDir`, and groups all entries into a single `ProjectData` tree — a root project plus zero or more workspace packages (anything under `packages/`).

### 2. Sync files (`syncFiles`)

Author files are written to disk. Existing files with identical content are skipped.

### 3. Hydrate new targets (`hydrateNew`)

If the project or a package directory didn't exist before this run, it's bootstrapped from a template:

- **Root** → `typescript-monorepo.tpl` (workspace `package.json`, `tsconfig`, etc.)
- **Package** → `typescript.tpl`, `react.tpl`, or `astro.tpl` depending on file extensions

Template files are never overwritten if they already exist on disk.

### 4. Resolve dependencies (`DependencyResolver`)

Each target's source files are scanned for bare import specifiers (e.g. `lodash`, `@mathpenny/utils`). For each import:

- **Own workspace package** — added as `workspace:*`
- **External npm package** — version is fetched from the npm registry and pinned to `^latest`. Results are cached in `~/projects/paladin/npm-dependencies.json` across runs.
- **Already declared** in the target's `package.json` — skipped entirely

Imports from test files (`*.test.ts`, `*.spec.ts`, files under `test/`) go into `devDependencies`.

### 5. Install (`bun install`)

If any manifest gained new dependencies, `bun install` runs once at the project root.

## Options

```ts
interface ScaffoldOptions {
  baseProjectDir: string       // root under which all projects live
  activeDir?: string | null    // fallback for resolving bare/relative paths
  git?: {
    initLocalRepo: boolean     // run `git init` for new projects
    initRemoteRepository: boolean  // create a remote repo for new projects
  }
}
```

`git` defaults to `{ initLocalRepo: true, initRemoteRepository: true }`. Pass `false` for either flag to skip that operation (e.g. set both to `false` in tests).

## Entry points

| Export | Description |
|---|---|
| `prepareTypescript` | Full pipeline for TypeScript/React/Astro projects |
| `prepareTypst` | Same pipeline for Typst documents |
