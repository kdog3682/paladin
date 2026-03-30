// @paladin/storylite/src/react/index.ts

import { tmpdir } from "os"
import { join } from "path"
import { discover } from "./discover"
import { startServer } from "./server"
import { capture } from "./capture"
import type { StoryLiteResult, StoryLiteOpts } from "./types"

const DEFAULTS = {
  outDir: join(tmpdir(), "storylite"),
  viewport: { width: 1280, height: 720 },
  timeout: 10_000,
}

/** Parses CSF story files, renders each story in a headless browser, and returns screenshots with metadata grouped by component. */
export async function storyliteReact(
  files: string[],
  opts?: StoryLiteOpts
): Promise<StoryLiteResult[]> {
  const outDir = opts?.outDir ?? DEFAULTS.outDir
  const viewport = opts?.viewport ?? DEFAULTS.viewport
  const timeout = opts?.timeout ?? DEFAULTS.timeout

  const storyModules = discover(files)

  if (storyModules.length === 0) return []

  const server = await startServer(storyModules, opts)

  try {
    const captureMap = await capture(server.url, storyModules, {
      outDir,
      viewport,
      timeout,
    })

    return storyModules.map((mod) => {
      const fileCaptures = captureMap.get(mod.filePath) ?? new Map()

      return {
        file: mod.filePath,
        component: mod.label,
        stories: mod.stories.map((story) => ({
          label: story.label,
          desc: story.desc,
          props: story.props,
          image: fileCaptures.get(story.exportName) ?? "",
        })),
      }
    })
  } finally {
    await server.close()
  }
}

export type { StoryLiteResult, StoryLiteOpts, CapturedStory } from "./types"
