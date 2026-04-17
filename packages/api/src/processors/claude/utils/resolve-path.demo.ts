import { resolvePath } from "./resolve-path";

const BASE = "~/projects";
const r = (raw: string, base: string | null = null) =>
  resolvePath(raw, base, BASE).replace(process.env.HOME ?? "", "~");

const pass = (label: string, got: string, expected: string) => {
  const ok = got === expected;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) {
    console.log(`   got:      ${got}`);
    console.log(`   expected: ${expected}`);
  }
};

// ─── absolute / home shortcuts ────────────────────────────────────────────────

pass("absolute path", r("/tmp/foo"), "/tmp/foo");
pass("home shortcut", r("~/foo/bar"), "~/foo/bar");

// ─── relative paths (with baseDir) ────────────────────────────────────────────
pass(
  "relative, with src",
  r("src/lib/db"),
  "~/projects/paladin/packages/api/src/lib/db",
);
pass(
  "relative, bare",
  r("utils/format", "@paladin/api"),
  "~/projects/paladin/packages/api/src/utils/format",
);
pass(
  "relative, with src",
  r("src/lib/db", "@paladin/api"),
  "~/projects/paladin/packages/api/src/lib/db",
);
pass(
  "relative, abs baseDir",
  r("utils/log", "/tmp/myapp"),
  "/tmp/myapp/src/utils/log",
);

// ─── explicit scopes (always win) ─────────────────────────────────────────────

pass(
  "explicit @paladin/web",
  r("@paladin/web/components/Button"),
  "~/projects/paladin/packages/web/src/components/Button",
);
pass(
  "explicit @paladin/api",
  r("@paladin/api/routes/users"),
  "~/projects/paladin/packages/api/src/routes/users",
);
pass(
  "explicit alias web",
  r("@web/hooks/useAuth"),
  "~/projects/paladin/packages/web/src/hooks/useAuth",
);
pass(
  "explicit alias api",
  r("@api/middleware/auth"),
  "~/projects/paladin/packages/api/src/middleware/auth",
);

// ─── known-ref → web ──────────────────────────────────────────────────────────

pass(
  "components",
  r("@paladin/foobar/components/Button"),
  "~/projects/paladin/packages/web/src/components/Button",
);
pass(
  "pages",
  r("@paladin/foobar/pages/Home"),
  "~/projects/paladin/packages/web/src/pages/Home",
);
pass(
  "views",
  r("@paladin/foobar/views/Dashboard"),
  "~/projects/paladin/packages/web/src/views/Dashboard",
);
pass(
  "layouts",
  r("@paladin/foobar/layouts/Shell"),
  "~/projects/paladin/packages/web/src/layouts/Shell",
);
pass(
  "hooks",
  r("@paladin/foobar/hooks/useUser"),
  "~/projects/paladin/packages/web/src/hooks/useUser",
);
pass(
  "context",
  r("@paladin/foobar/context/AuthCtx"),
  "~/projects/paladin/packages/web/src/context/AuthCtx",
);
pass(
  "providers",
  r("@paladin/foobar/providers/Theme"),
  "~/projects/paladin/packages/web/src/providers/Theme",
);
pass(
  "stores",
  r("@paladin/foobar/stores/userStore"),
  "~/projects/paladin/packages/web/src/stores/userStore",
);
pass(
  "ui",
  r("@paladin/foobar/ui/Modal"),
  "~/projects/paladin/packages/web/src/ui/Modal",
);
pass(
  "assets",
  r("@paladin/foobar/assets/logo.svg"),
  "~/projects/paladin/packages/web/src/assets/logo.svg",
);
pass(
  "styles",
  r("@paladin/foobar/styles/globals.css"),
  "~/projects/paladin/packages/web/src/styles/globals.css",
);
pass(
  "icons",
  r("@paladin/foobar/icons/ChevronDown"),
  "~/projects/paladin/packages/web/src/icons/ChevronDown",
);
pass(
  "theme",
  r("@paladin/foobar/theme/colors"),
  "~/projects/paladin/packages/web/src/theme/colors",
);

// ─── known-ref → api ──────────────────────────────────────────────────────────

pass(
  "routes",
  r("@paladin/foobar/routes/users"),
  "~/projects/paladin/packages/api/src/routes/users",
);
pass(
  "services",
  r("@paladin/foobar/services/mailer"),
  "~/projects/paladin/packages/api/src/services/mailer",
);
pass(
  "controllers",
  r("@paladin/foobar/controllers/auth"),
  "~/projects/paladin/packages/api/src/controllers/auth",
);
pass(
  "middleware",
  r("@paladin/foobar/middleware/rateLimit"),
  "~/projects/paladin/packages/api/src/middleware/rateLimit",
);
pass(
  "models",
  r("@paladin/foobar/models/User"),
  "~/projects/paladin/packages/api/src/models/User",
);
pass(
  "db",
  r("@paladin/foobar/db/migrations"),
  "~/projects/paladin/packages/api/src/db/migrations",
);
pass(
  "jobs",
  r("@paladin/foobar/jobs/sendEmail"),
  "~/projects/paladin/packages/api/src/jobs/sendEmail",
);
pass(
  "queues",
  r("@paladin/foobar/queues/default"),
  "~/projects/paladin/packages/api/src/queues/default",
);
pass(
  "workers",
  r("@paladin/foobar/workers/processor"),
  "~/projects/paladin/packages/api/src/workers/processor",
);
pass(
  "events",
  r("@paladin/foobar/events/userCreated"),
  "~/projects/paladin/packages/api/src/events/userCreated",
);
pass(
  "sockets",
  r("@paladin/foobar/sockets/chat"),
  "~/projects/paladin/packages/api/src/sockets/chat",
);

// ─── default → api (no known-ref, no explicit scope) ─────────────────────────

pass(
  "default api (utils)",
  r("@paladin/foobar/utils/hash"),
  "~/projects/paladin/packages/api/src/utils/hash",
);
pass(
  "default api (lib)",
  r("@paladin/foobar/lib/jwt"),
  "~/projects/paladin/packages/api/src/lib/jwt",
);
pass(
  "default api (config)",
  r("@paladin/foobar/config/env"),
  "~/projects/paladin/packages/api/src/config/env",
);

// ─── bare package root (no sub-path) ──────────────────────────────────────────

pass(
  "bare root, known pkg",
  r("@paladin/api"),
  "~/projects/paladin/packages/api",
);
pass(
  "bare root, unknown pkg",
  r("@paladin/foobar"),
  "~/projects/paladin/packages/foobar",
);

// ─── skip-src paths ───────────────────────────────────────────────────────────

pass(
  "skip src: docs",
  r("@paladin/api/docs/readme"),
  "~/projects/paladin/packages/api/docs/readme",
);
pass(
  "skip src: tsconfig",
  r("@paladin/api/tsconfig.json"),
  "~/projects/paladin/packages/api/tsconfig.json",
);
pass(
  "skip src: package.json",
  r("@paladin/api/package.json"),
  "~/projects/paladin/packages/api/package.json",
);
pass(
  "skip src: vite.config",
  r("@paladin/web/vite.config.ts"),
  "~/projects/paladin/packages/web/vite.config.ts",
);
