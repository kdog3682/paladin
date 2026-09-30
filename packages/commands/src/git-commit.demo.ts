// bun git-commit.demo.ts                → prints each package's context only, no AI call (current default)
// bun git-commit.demo.ts --ai           → dry run: asks the AI and prints the context and the plan
// bun git-commit.demo.ts --ai --no-context → dry run, plan only
// bun git-commit.demo.ts --ai --commit  → actually commits
import { gitCommit } from "./git-commit.ts"

const MANIM = "/home/kdog3682/projects/mathpen/packages/manim"

const useAi = process.argv.includes("--ai")
const commit = useAi && process.argv.includes("--commit")
const showContext = !process.argv.includes("--no-context")

const plans = await gitCommit(MANIM, { dryRun: !commit, showContext, contextOnly: !useAi })

if (useAi && !commit && plans.length) console.log("\n(dry run — pass --commit to apply)")
