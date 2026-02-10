// @paladin/types/src/test.ts

export interface TestCase {
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

export interface TestSuite {
  file: string
  tests: TestCase[]
  duration: number
}

export interface TestRunResult {
  success: boolean
  suites: TestSuite[]
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
    duration: number
  }
  rawOutput: string
}
