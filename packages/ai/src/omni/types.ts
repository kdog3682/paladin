// @paladin/ai/omni/types.ts

import type Anthropic from "@anthropic-ai/sdk"

export interface OmniOptions {
  model?: string
  maxTurns?: number
  systemPrompt?: string
  verbose?: boolean
}

export type MessageParam = Anthropic.MessageParam
export type ContentBlock = Anthropic.ContentBlock
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam
export type Tool = Anthropic.Tool
