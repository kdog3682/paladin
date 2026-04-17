import { resolvePath } from "./resolve-path"

// absolute & home paths pass through
resolvePath("/etc/hosts")
resolvePath("~/notes.md")

// scoped paths with explicit package
resolvePath("@paladin/web/components/Button.tsx")
resolvePath("@paladin/api/routes/users.ts")

// scoped aliases (web -> paladin/web, api -> paladin/api)
resolvePath("@web/components/Button.tsx")
resolvePath("@api/routes/users.ts")

// scoped with explicit workspace folder
resolvePath("@paladin/apps/web/pages/Home.tsx")
resolvePath("@paladin/packages/api/services/auth.ts")

// scoped pkg-only (no file path)
resolvePath("@paladin/web")
resolvePath("@paladin/api")

// scoped with unknown pkg + known-ref segment → redirects to web/api
resolvePath("@paladin/foo/components/Button.tsx") // → web
resolvePath("@paladin/foo/routes/users.ts") // → api

// scoped with unknown pkg + no known-ref → defaults to api
resolvePath("@paladin/foo/lib/helpers.ts")

// relative path with scope (scoped)
resolvePath("components/Button.tsx", "@paladin/web")
resolvePath("routes/users.ts", "@paladin/api")

// relative path with scope (filesystem)
resolvePath(
  "components/Button.tsx",
  "~/projects/paladin/packages/web",
)
resolvePath(
  "src/components/Button.tsx",
  "~/projects/paladin/packages/web",
)

// relative path without scope → infers from refs
resolvePath("components/Button.tsx") // → web
resolvePath("routes/users.ts") // → api (default)
resolvePath("lib/helpers.ts") // → api (default)

// src-prefixed path without baseDir
resolvePath("src/components/Button.tsx")

// custom projects dir
resolvePath("@paladin/web/components/Button.tsx", null, "~/code")
resolvePath("@web/components/Button.tsx", null, "/workspace")

// skip-src dirs stay at root (no src/ prefix added)
resolvePath("@paladin/web/docs/readme.md")
resolvePath("@paladin/api/scripts/migrate.ts")
resolvePath("@paladin/web/tsconfig.json")
resolvePath("@paladin/api/package.json")
resolvePath("@paladin/web/vite.config.ts")
