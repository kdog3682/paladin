// @paladin/ai/src/query.ts

import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

const MODELS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-6",
} as const

export type ModelAlias = keyof typeof MODELS

let currentModel: ModelAlias = "sonnet"

export function setModel(alias: ModelAlias): void {
  currentModel = alias
}

export function getModel(): ModelAlias {
  return currentModel
}

export function resolveModel(alias: ModelAlias): string {
  return MODELS[alias]
}

/**
 * Simple single-turn query to Claude.
 * Returns the text response.
 */
export async function query(prompt: string, model?: ModelAlias): Promise<string> {
  const response = await client.messages.create({
    model: resolveModel(model ?? currentModel),
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  })

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
}
