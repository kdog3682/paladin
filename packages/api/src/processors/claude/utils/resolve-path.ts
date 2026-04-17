import path from "node:path";
import os from "node:os";

const SCOPED_ALIASES: Record<string, string> = {
  web: "paladin/web",
  api: "paladin/api",
};

const WORKSPACE_FOLDERS = ["packages", "apps"];
const DEFAULT_WORKSPACE = "packages";
const SKIP_SRC_DIRS = ["src", "docs", "scripts", "python", "typst"];
const CONFIG_PREFIXES = ["tsconfig", "package.json"];

// Segments that always resolve to a known package regardless of alias detection
const KNOWN_REF_MAP: Record<string, "web" | "api"> = {
  // always → web
  components: "web",
  stores: "web",
  pages: "web",
  views: "web",
  layouts: "web",
  hooks: "web",
  context: "web",
  providers: "web",
  ui: "web",
  assets: "web",
  styles: "web",
  icons: "web",
  theme: "web",
  // always → api
  routes: "api",
  services: "api",
  controllers: "api",
  middleware: "api",
  models: "api",
  db: "api",
  jobs: "api",
  queues: "api",
  workers: "api",
  events: "api",
  sockets: "api",
};

export function resolvePath(
  rawPath: string,
  baseDir?: string | null, // the dir granted from user messages
  baseProjectsDirectory?: string | null, // ~/projects
): string {
  // if (!baseDir) baseDir = ''
  if (!baseProjectsDirectory) baseProjectsDirectory = '~/projects'
  if (rawPath.startsWith("~/")) {
    return path.join(os.homedir(), rawPath.slice(2));
  }
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  if (rawPath.startsWith("@")) {
    return resolveScoped(rawPath, baseProjectsDirectory);
  }
  if (!baseDir) {
    // Try to infer a base from known-ref segments before throwing
    const segments = rawPath.replace(/^src\//, "").split("/");
    const knownTarget = segments
      .map((s) => KNOWN_REF_MAP[s])
      .find(Boolean);
    if (knownTarget) {
      return resolveScoped(
        `@paladin/${knownTarget}/${rawPath}`,
        baseProjectsDirectory,
      );
    } else {
            return resolveScoped(
        `@paladin/api/${rawPath}`,
        baseProjectsDirectory,
      );
    }
    throw new Error(
      `cannot resolve relative path "${rawPath}" without a base directory`,
    );
  }
  if (baseDir.startsWith("@")) {
    const resolvedBase = resolveScoped(
      baseDir,
      baseProjectsDirectory,
    );
    return resolveRelative(rawPath, resolvedBase);
  }
  return resolveRelative(rawPath, expandDir(baseDir));
}

function resolveScoped(
  rawPath: string,
  baseProjectsDirectory: string,
): string {
  const base = expandDir(baseProjectsDirectory);
  let withoutAt = rawPath.slice(1);

  const firstSeg = withoutAt.split("/")[0];
  if (SCOPED_ALIASES[firstSeg]) {
    withoutAt =
      SCOPED_ALIASES[firstSeg] + withoutAt.slice(firstSeg.length);
  }

  const parts = withoutAt.split("/");
  const org = parts[0].toLowerCase();
  const isExplicitWs = WORKSPACE_FOLDERS.includes(parts[1]);
  const wsFolder = isExplicitWs ? parts[1] : DEFAULT_WORKSPACE;
  const pkg = (isExplicitWs ? parts[2] : parts[1])?.toLowerCase();
  const rest = isExplicitWs ? parts.slice(3) : parts.slice(2);
  const filePath = rest.join("/");

  // --- known-ref priority resolution ---
  // If any segment in `rest` is a known ref, override the package accordingly,
  // but only when the path was NOT already explicitly scoped (e.g. @paladin/web or @paladin/api).
  // An explicit scope means org+pkg already resolves to "web" or "api" directly.
  const isExplicitScope = pkg === "web" || pkg === "api";

  if (!isExplicitScope && rest.length > 0) {
    const knownTarget = rest
      .map((s) => KNOWN_REF_MAP[s])
      .find(Boolean);
    if (knownTarget) {
      // Redirect to the appropriate package, preserving the file path
      const targetPkg = knownTarget; // "web" | "api"
      const firstName = rest[0];
      const skipSrc =
        SKIP_SRC_DIRS.includes(firstName) ||
        CONFIG_PREFIXES.some((c) => firstName.startsWith(c)) ||
        firstName.includes(".config.");
      const resolved =
        !filePath || skipSrc ? filePath : `src/${filePath}`;
      return path.join(base, org, wsFolder, targetPkg, resolved);
    }

    // No explicit scope, no known-ref match → default to "api"
    if (pkg !== "web" && pkg !== "api") {
      const firstName = rest[0];
      const skipSrc =
        !firstName ||
        SKIP_SRC_DIRS.includes(firstName) ||
        CONFIG_PREFIXES.some((c) => firstName.startsWith(c)) ||
        firstName.includes(".config.");

      if (!filePath) {
        // e.g. @paladin/foobar → resolve as package root under api? No — keep original pkg.
        // The default-to-api rule applies only when pkg itself is ambiguous (not a real pkg name).
        // We fall through to normal resolution below.
      } else {
        // Has a file path but no known-ref → default package target is "api"
        const resolved = skipSrc ? filePath : `src/${filePath}`;
        return path.join(base, org, wsFolder, "api", resolved);
      }
    }
  }
  // --- end known-ref resolution ---

  if (!filePath) {
    return path.join(base, org, wsFolder, pkg);
  }

  const firstName = rest[0];
  const skipSrc =
    SKIP_SRC_DIRS.includes(firstName) ||
    CONFIG_PREFIXES.some((c) => firstName.startsWith(c)) ||
    firstName.includes(".config.");
  const resolved = skipSrc ? filePath : `src/${filePath}`;
  return path.join(base, org, wsFolder, pkg, resolved);
}

function resolveRelative(
  relativePath: string,
  baseDir: string,
): string {
  const parts = relativePath.split("/");
  if (parts[0] !== "src") {
    return path.join(baseDir, "src", relativePath);
  }
  return path.join(baseDir, relativePath);
}

function expandDir(dir: string): string {
  if (dir.startsWith("~/")) {
    return path.join(os.homedir(), dir.slice(2));
  }
  return dir;
}
