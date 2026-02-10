// @paladin/ai/src/git-commit.ts

import Anthropic from "@anthropic-ai/sdk"
import { resolveModel, getModel, type ModelAlias } from "./query"
import type { GitRepo } from "@paladin/api/src/vcs"

const client = new Anthropic()

interface GitCommitOptions {
  length?: "short" | "medium" | "long"
  conventionalCommit?: boolean
  focus?: string[]
  model?: ModelAlias
}

interface GitCommitParams {
  files: string[]
  repo: GitRepo
  options?: GitCommitOptions
}

export async function gitCommit({ files, repo, options = {} }: GitCommitParams): Promise<string> {
  const {
    length = "short",
    conventionalCommit = true,
    focus = [],
    model,
  } = options

  await repo.add(...files)
  const diff = await repo.diff(true)

  const lengthGuide = {
    short: "Write a single line commit message, max 72 characters.",
    medium: "Write a commit message with a subject line and 2-3 bullet points in the body.",
    long: "Write a detailed commit message with a subject line and a thorough body explaining what changed and why.",
  }

  const conventionalPrefix = conventionalCommit
    ? "Use conventional commit format (feat:, fix:, refactor:, chore:, docs:, test:, style:)."
    : ""

  const focusGuide = focus.length > 0
    ? `Focus on these aspects: ${focus.join(", ")}.`
    : ""

  const prompt = [
    "Generate a git commit message for the following diff.",
    lengthGuide[length],
    conventionalPrefix,
    focusGuide,
    "Respond with ONLY the commit message, no explanation or markdown.",
    "",
    `Files: ${files.join(", ")}`,
    "",
    "Diff:",
    diff,
  ].filter(Boolean).join("\n")

  const response = await client.messages.create({
    model: resolveModel(model ?? getModel()),
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  })

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()

  return text
}
