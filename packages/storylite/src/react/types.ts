// @paladin/storylite/src/react/types.ts

import type { InlineConfig } from "vite"
import type { ComponentType, ReactNode } from "react"

export type Decorator = (Story: ComponentType) => ReactNode

export type StoryMeta = {
  component: ComponentType
  label: string
  desc?: string
  decorators?: Decorator[]
}

export type StoryEntry = {
  exportName: string
  args?: Record<string, unknown>
  decorators?: Decorator[]
}

export type StoryModule = {
  filePath: string
  label: string
  desc: string
  stories: StoryExport[]
}

export type StoryExport = {
  exportName: string
  label: string
  desc: string
  props: Record<string, unknown>
}

export type CapturedStory = {
  label: string
  desc: string
  props: Record<string, unknown>
  image: string
}

export type StoryLiteResult = {
  file: string
  component: string
  stories: CapturedStory[]
}

export type StoryLiteOpts = {
  outDir?: string   // defaults to os.tmpdir()/storylite
  viewport?: { width: number, height: number }
  timeout?: number
  viteConfig?: InlineConfig
}
