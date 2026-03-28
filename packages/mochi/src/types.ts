// @paladin/mochi/src/types.ts

export interface MochiGlobal {
  name: string
  body: string
}

export interface MochiStory {
  name: string
  description: string | null
  body: string
  expected: string | null
}

export interface MochiResult {
  name: string
  value: unknown
  duration: number
  error: Error | null
}

export interface MochiHooks {
  beforeAll: boolean
  beforeEach: boolean
  afterEach: boolean
  afterAll: boolean
}

export interface MochiSuite {
  path: string
  globals: MochiGlobal[]
  hooks: MochiHooks
  stories: MochiStory[]
  results: MochiResult[]
}

export const HOOK_NAMES = ["beforeAll", "beforeEach", "afterEach", "afterAll"] as const
export type HookName = (typeof HOOK_NAMES)[number]
