// @paladin/scribe-ui/src/components/Editor.tsx

import { forwardRef, useCallback } from "react"
import { useStore } from "../store"
import { Input } from "@bklearn/shadcn"
import { Button } from "@bklearn/shadcn"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bklearn/shadcn"
import { Clipboard, Eye, ListTodo } from "lucide-react"
import { toast } from "sonner"
import * as api from "../api"

const DEFAULT_TEMPLATE = { key: "__default__", name: "Default", content: "{{source-files}}\n{{instructions}}" }

const SUBMIT_MODES = [
  { value: "clipboard" as const, icon: Clipboard, label: "Copy" },
  { value: "preview" as const, icon: Eye, label: "Preview" },
  { value: "task" as const, icon: ListTodo, label: "Task" },
]

export const Editor = forwardRef<HTMLTextAreaElement>(function Editor(_, ref) {
  const {
    body,
    name,
    templateKey,
    templates,
    submitMode,
    sourceFiles,
    fileContents,
    setBody,
    setName,
    setTemplateKey,
    setSubmitMode,
    setTemplateManagerOpen,
    setPreviewOpen,
    readFile,
  } = useStore()

  const activeTemplate =
    templates.find((t) => t.key === templateKey) ?? DEFAULT_TEMPLATE

  const allTemplates = [DEFAULT_TEMPLATE, ...templates]

  const handleSubmit = useCallback(async () => {
    const sfBlocks: string[] = []
    for (const path of sourceFiles) {
      const content = fileContents[path] ?? (await readFile(path))
      sfBlocks.push(`<source-file path="${path}">${content}</source-file>`)
    }
    const sfString = sfBlocks.join("\n")
    const instructionsString = `<instructions>${body}</instructions>`

    let result = activeTemplate.content
    result = result.replace("{{source-files}}", sfString)
    result = result.replace("{{instructions}}", instructionsString)

    await navigator.clipboard.writeText(result)
    toast.success("Copied to clipboard")

    if (submitMode === "preview") {
      setPreviewOpen(true)
    }
  }, [body, sourceFiles, fileContents, activeTemplate, submitMode])

  const currentMode = SUBMIT_MODES.find((m) => m.value === submitMode)!
  const ModeIcon = currentMode.icon

  const cycleMode = () => {
    const idx = SUBMIT_MODES.findIndex((m) => m.value === submitMode)
    const next = SUBMIT_MODES[(idx + 1) % SUBMIT_MODES.length]
    setSubmitMode(next.value)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Untitled"
          className="flex-1 border-none shadow-none text-base font-bold focus-visible:ring-0 px-0"
        />
        <div className="flex flex-col items-end">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={() => setTemplateManagerOpen(true)}
          >
            template — <span className="italic">{activeTemplate.name}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 relative">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your instructions here…"
          className="w-full h-full resize-none bg-transparent p-4 text-sm font-mono leading-relaxed focus:outline-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />

        {/* Submit button — inset SE corner */}
        <div className="absolute bottom-4 right-4 flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-r-none border-r-0 px-2 gap-1 text-muted-foreground hover:text-foreground"
                  onClick={cycleMode}
                >
                  <ModeIcon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">click to cycle mode</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            size="sm"
            className="rounded-l-none"
            onClick={handleSubmit}
          >
            {currentMode.label}
          </Button>
        </div>
      </div>
    </div>
  )
})
