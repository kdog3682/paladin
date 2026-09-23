import { resolveScopedPath } from "@paladin/utils"
import type { Matcher } from "./matcher"
import type { BashOp } from "./types"

export interface Registration {
  /** Globs; the registration claims a path when any of them matches. */
  matches: Matcher
  /** The command, split into args. Matched paths are appended. `@owner/pkg` parts are resolved at load. */
  command: string[]
  purpose: BashOp["purpose"]
  /** A failure here stops everything queued behind it. Off by default. */
  strict?: boolean
  /** One run over every matched file, instead of a run per file. */
  grouped?: boolean
  /** Off means the registration never matches. On by default. */
  enabled?: boolean
}

/**
 * The first registration whose globs match wins, so list specific ones before
 * general ones (`webrun` before `example` and `demo`).
 *
 * To make a new kind runnable, add a registration here. `isRunnable` reads this list,
 * so `updateBarrel` already keeps such files out of the barrel. A new `purpose` goes in
 * `BashOp["purpose"]` (types.ts) and `BASH_ORDER` (ops.ts).
 */
export const DEFAULT_REGISTRATIONS: Registration[] = [
  {
    // codemod transforms/commands, plus the corpus outputs they are tested against
    purpose: "test",
    matches: ["**/packages/codemod/src/{transforms,commands}/*.ts", "**/packages/codemod/corpus/*/output.ts"],
    command: ["bun", "run", "@paladin/codemod/test.ts"],
  },
  {
    // recast specs
    purpose: "script",
    matches: ["**/packages/recast/src/specs/**"],
    command: ["bun", "run", "@paladin/recast/runner.ts"],
  },
  {
    // webrun: App.tsx, <name>.app.tsx, and tsx examples
    purpose: "bin",
    matches: [
      "**/*.{bin,cli}.ts",
    ],
    command: ["bun", "run", "@paladin/commands/setupBinCommand.ts"],
  },
  {
    // webrun: App.tsx, <name>.app.tsx, and tsx examples
    purpose: "demo",
    matches: [
      "**/App.tsx",
      "**/*.app.tsx",
      "**/{example,examples}/**/*.tsx",
      "**/*.{example,examples}.tsx",
    ],
    command: ["bun", "run", "@paladin/webrun/cli.ts"],
  },
  {
    // stories
    purpose: "demo",
    matches: ["**/{story,stories}/**/*.tsx", "**/*.{story,stories}.tsx"],
    command: ["bun", "run", "@paladin/storylite"],
    enabled: false,
  },
  {
    purpose: "test",
    matches: ["**/{test,tests,__tests__}/**/*.ts", "**/*.{test,spec}.ts"],
    command: ["bun", "test"],
    grouped: true,
  },
  {
    purpose: "test",
    matches: ["**/{test,tests,__tests__}/**/*.tsx", "**/*.{test,spec}.tsx"],
    command: ["bun", "test", "--preload", "./happydom.ts"],
    grouped: true,
  },
  {
    purpose: "example",
    matches: ["**/{example,examples}/**/*.ts", "**/*.{example,examples}.ts"],
    command: ["bun", "run", "@paladin/exemplar/cli.ts"],
    grouped: true,
  },
  {
    purpose: "demo",
    matches: ["**/{demo,demos}/**/*.{ts,tsx}", "**/*.demo.{ts,tsx}"],
    command: ["bun", "run"],
  },
  {
    purpose: "script",
    matches: ["**/{script,scripts}/**/*.{ts,tsx}", "**/*.script.{ts,tsx}"],
    command: ["bun", "run"],
  },
]

// resolve `@owner/pkg` command parts to real paths, once, in place
for (const registration of DEFAULT_REGISTRATIONS) {
  registration.command = registration.command.map((part) =>
    part.startsWith("@") ? resolveScopedPath(part, {}) : part,
  )
}
