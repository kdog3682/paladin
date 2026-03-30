// @paladin/storylite/src/react/server.ts

import { createServer, type InlineConfig } from "vite"
import { existsSync } from "fs"
import { resolve, dirname } from "path"
import { storylitePlugin } from "./vite-plugin"
import type { StoryModule, StoryLiteOpts } from "./types"

export type StoryLiteServer = {
  url: string
  close: () => Promise<void>
}

export async function startServer(
  storyModules: StoryModule[],
  opts?: StoryLiteOpts
): Promise<StoryLiteServer> {
  const port = await findOpenPort(5200)
  const projectRoot = resolveProjectRoot(storyModules, opts)
  const allPaths = storyModules.map((m) => resolve(m.filePath))
  const fsAllow = computeFsAllow(allPaths, projectRoot)

  const config: InlineConfig = {
    configFile: opts?.viteConfig?.configFile ?? undefined,
    root: projectRoot,
    server: {
      port,
      strictPort: true,
      hmr: false,
      fs: {
        allow: fsAllow,
        strict: false,
      },
      ...opts?.viteConfig?.server,
    },
    plugins: [
      storylitePlugin(storyModules),
      ...(opts?.viteConfig?.plugins ?? []),
    ],
    optimizeDeps: {
      include: ["react", "react-dom/client"],
      ...opts?.viteConfig?.optimizeDeps,
    },
    logLevel: "silent",
  }

  const server = await createServer(config)
  await server.listen()

  const resolved = server.resolvedUrls?.local?.[0] ?? `http://localhost:${port}`

  return {
    url: resolved.replace(/\/$/, ""),
    close: () => server.close(),
  }
}

function resolveProjectRoot(storyModules: StoryModule[], opts?: StoryLiteOpts): string {
  if (opts?.viteConfig?.root) return resolve(opts.viteConfig.root)

  const startDir = dirname(resolve(storyModules[0].filePath))
  return findPackageRoot(startDir) ?? startDir
}

function findPackageRoot(dir: string): string | null {
  let current = dir

  while (current !== dirname(current)) {
    if (existsSync(resolve(current, "package.json"))) return current
    current = dirname(current)
  }

  return null
}

function computeFsAllow(filePaths: string[], root: string): string[] {
  const dirs = new Set<string>()
  dirs.add(root)

  for (const fp of filePaths) {
    dirs.add(dirname(fp))
  }

  const all = [...dirs]
  let common = all[0]
  for (const dir of all) {
    while (!dir.startsWith(common)) {
      common = dirname(common)
    }
  }

  return [common]
}

async function findOpenPort(start: number): Promise<number> {
  const { createServer } = await import("net")

  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.on("error", () => {
      resolve(findOpenPort(start + 1))
    })
    server.listen(start, () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : start
      server.close(() => resolve(port))
    })
  })
}
