// @paladin/types/src/artifact.ts

export interface RunCase {
  name: string
  status: "pass" | "fail" | "skip"
  duration?: number
  error?: {
    message: string
    expected?: string
    actual?: string
    stack?: string
  }
}

export interface RunSuite {
  file: string
  tests: RunCase[]
  duration: number
}

export interface RunResult {
  success: boolean
  suites: RunSuite[]
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
    duration: number
  }
  rawOutput: string
}

export interface Artifact {
  id: string
  title: string
  content: string
  language: string
  path: string | null
  aliasedPath: string | null
  status: "created" | "modified" | "deleted" | "committed"
  runResult?: RunResult
}

export interface ContentBlock {
  type: string
  name?: string
  input?: Record<string, string>
}

export interface Message {
  uuid: string
  sender: "user" | "assistant"
  content: ContentBlock[]
}

export interface Conversation {
  messages: Message[]
}
