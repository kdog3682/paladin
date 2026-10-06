import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Block, ToolResultBlock, Turn } from "../lib/api"
import { ImageResult } from "./ImageResult"
import { ToolCall } from "./ToolCall"
import { Disclosure, Truncated } from "./Truncated"

type Props = { turn: Turn; results: Map<string, ToolResultBlock> }

const markdown = (text: string) => (
  <div className="md font-sans text-sm leading-relaxed text-neutral-900">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
)

function BlockView({ block, results, user }: { block: Block; results: Props["results"]; user: boolean }) {
  switch (block.type) {
    case "text":
      return user ? (
        <Truncated text={block.text} className="font-sans text-sm leading-relaxed text-neutral-900" />
      ) : (
        <Truncated text={block.text} render={markdown} />
      )
    case "thinking":
      return (
        <Disclosure label="thinking" global={false}>
          <Truncated text={block.text} className="text-xs italic text-neutral-500" />
        </Disclosure>
      )
    case "tool_use":
      return <ToolCall tool={block} result={results.get(block.id)} />
    case "image":
      return <ImageResult image={block} />
    // rendered inside the tool call that made it
    case "tool_result":
      return null
  }
}

export function TurnView({ turn, results }: Props) {
  const user = turn.role === "user"
  return (
    <div className={`flex gap-3 ${turn.sidechain ? "opacity-60" : ""}`}>
      <div className="w-12 shrink-0 pt-0.5 text-right text-[10px] uppercase tracking-wide text-neutral-400">
        {user ? "you" : "claude"}
      </div>
      <div
        className={`min-w-0 flex-1 space-y-2 ${user ? "rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2" : ""}`}
      >
        {turn.blocks.map((b, i) => (
          <BlockView key={i} block={b} results={results} user={user} />
        ))}
      </div>
    </div>
  )
}
