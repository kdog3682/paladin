// @paladin/ai/omni/agent.ts

import Anthropic from "@anthropic-ai/sdk"
import type { OmniOptions, MessageParam, ToolResultBlockParam } from "./types"
import { tools, executeTool } from "./tools"

const DEFAULT_SYSTEM = `You are Omni, a powerful autonomous coding agent. You operate in the user's local project directory.

Tools: read, write, edit, bash, glob, grep.

Guidelines:
- Think step by step before acting.
- Use glob/grep to understand the codebase before making changes.
- Use read before edit to see current file contents.
- Use bash for git, running scripts, installing deps, etc.
- Be thorough. Verify your work when reasonable.
- Prefer small, atomic changes.`

const client = new Anthropic()

export async function runAgent(
  prompt: string,
  opts: OmniOptions = {}
): Promise<string> {
  const {
    model = "claude-sonnet-4-20250514",
    maxTurns = 30,
    systemPrompt = DEFAULT_SYSTEM,
    verbose = true,
  } = opts

  const messages: MessageParam[] = [
    { role: "user", content: prompt },
  ]

  for (let turn = 0; turn < maxTurns; turn++) {
    if (verbose) console.log(`\n🔄 turn ${turn + 1}`)

    const response = await client.messages.create({
      model,
      max_tokens: 8096,
      system: systemPrompt,
      tools,
      messages,
    })

    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)

    if (verbose && textBlocks.length) {
      console.log(`\n💬 ${textBlocks.join("\n")}`)
    }

    if (response.stop_reason === "end_turn") {
      return textBlocks.join("\n")
    }

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )

    if (!toolUseBlocks.length) {
      return textBlocks.join("\n")
    }

    const toolResults: ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          verbose
        ),
      }))
    )

    messages.push({ role: "assistant", content: response.content })
    messages.push({ role: "user", content: toolResults })
  }

  return "Max turns reached."
}
