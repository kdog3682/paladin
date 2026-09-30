import { Loader2, X } from "lucide-react"
import { Badge, Button, cn } from "@paladin/shadcn"
import type { RunResult } from "../api"
import { basename } from "../lib/paths"

export type RunState = {
  file: string
  pending: boolean
  result?: RunResult
}

export function RunOutput({ run, onClose }: { run: RunState, onClose: () => void }) {
  const { result } = run
  return (
    <div className="flex max-h-[40vh] min-h-32 flex-col border-t bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-1.5">
        <span className="font-mono text-xs font-semibold">{basename(run.file)}</span>
        {run.pending ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : result ? (
          <>
            <Badge variant={result.exitCode === 0 ? "secondary" : "destructive"} className="text-[10px]">
              exit {result.exitCode}
            </Badge>
            <span className="text-xs text-muted-foreground">{result.durationMs}ms</span>
          </>
        ) : (
          <span className="text-xs text-destructive">failed to run</span>
        )}
        <Button variant="ghost" size="icon" className="ml-auto size-6" onClick={onClose} aria-label="Close output">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2 font-mono text-xs leading-relaxed">
        {result?.stdout && <pre className="whitespace-pre-wrap">{result.stdout}</pre>}
        {result?.stderr && <pre className={cn("whitespace-pre-wrap text-destructive")}>{result.stderr}</pre>}
        {result && !result.stdout && !result.stderr && <p className="text-muted-foreground">No output.</p>}
      </div>
    </div>
  )
}
