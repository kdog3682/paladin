// src/components/SessionMonitor/Results.tsx

import { useState } from "react"
import {
  Card, CardContent, CardHeader, CardTitle,
  Badge, Button, Switch, Label,
  Collapsible, CollapsibleContent, CollapsibleTrigger,
  cn,
} from "@bklearn/shadcn"
import { ChevronRight, RefreshCw, CheckCircle2, XCircle } from "lucide-react"
import { useSetAutoRun, useRerun } from "./api"
import type { RunResult } from "./types"

interface ResultsProps {
  results: RunResult[]
}

function shortPath(p: string) {
  const parts = p.split("/")
  const idx = parts.findIndex((x) => x === "packages")
  if (idx >= 0 && idx + 1 < parts.length) return parts.slice(idx + 1).join("/")
  return parts.slice(-3).join("/")
}

export function Results({ results }: ResultsProps) {
  return (
    <div className="flex-1 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Run Results</h2>
        <Badge variant="outline">{results.length}</Badge>
      </div>

      {results.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No run results yet
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <ResultCard key={`${r.name}:${r.file}`} result={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultCard({ result }: { result: RunResult }) {
  const [open, setOpen] = useState(false)
  const [autoRun, setAutoRun] = useState(true)
  const setAutoRunMut = useSetAutoRun()
  const rerunMut = useRerun()
  const [currentResult, setCurrentResult] = useState(result)

  const handleAutoRunChange = (enabled: boolean) => {
    setAutoRun(enabled)
    setAutoRunMut.mutate({ file: result.file, enabled })
  }

  const handleRerun = () => {
    rerunMut.mutate(
      { file: result.file },
      { onSuccess: (data) => setCurrentResult(data) },
    )
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
              <ChevronRight
                className={cn(
                  "size-4 transition-transform",
                  open && "rotate-90",
                )}
              />
              {currentResult.success ? (
                <CheckCircle2 className="size-4 text-green-500" />
              ) : (
                <XCircle className="size-4 text-red-500" />
              )}
              <CardTitle className="text-sm font-mono">
                {currentResult.name}
              </CardTitle>
              <span className="text-xs text-muted-foreground truncate">
                {shortPath(currentResult.file)}
              </span>
            </CollapsibleTrigger>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`autorun-${result.file}`}
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  auto
                </Label>
                <Switch
                  id={`autorun-${result.file}`}
                  checked={autoRun}
                  onCheckedChange={handleAutoRunChange}
                />
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleRerun}
                disabled={rerunMut.isPending}
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    rerunMut.isPending && "animate-spin",
                  )}
                />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <ResultData data={currentResult.data} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

function ResultData({ data }: { data: Record<string, unknown> }) {
  const stdout = typeof data.stdout === "string" ? data.stdout : ""
  const stderr = typeof data.stderr === "string" ? data.stderr : ""

  if (stdout || stderr) {
    return (
      <div className="flex flex-col gap-2">
        {stdout && (
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
            {stdout}
          </pre>
        )}
        {stderr && (
          <pre className="text-xs bg-red-500/10 text-red-700 dark:text-red-400 p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
            {stderr}
          </pre>
        )}
      </div>
    )
  }

  return (
    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}
