import { Badge, ScrollArea, cn } from "@bklearn/shadcn"
import {
  GitBranch,
  Folder,
  MessageSquare,
  ExternalLink,
} from "lucide-react"
import type { SessionData } from "./types"

interface SidebarProps {
  session: SessionData | null
  connected: boolean
}

function shortPath(p: string) {
  const parts = p.split("/")
  const idx = parts.findIndex((x) => x === "packages")
  if (idx >= 0 && idx + 1 < parts.length)
    return parts.slice(idx + 1).join("/")
  return parts.slice(-3).join("/")
}

export function Sidebar({ session, connected }: SidebarProps) {
  return (
    <div className="flex flex-col w-80 border-r bg-muted/20 h-full">
      {/* Status header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background/50">
        <span className="relative flex size-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-60",
              connected && "animate-ping bg-green-500",
            )}
          />
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              connected ? "bg-green-500" : "bg-muted-foreground/40",
            )}
          />
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {!session ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-sm text-muted-foreground text-center">
            Waiting for session...
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Project + Conversation header block */}
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Folder className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {session.project.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate font-mono">
                    {session.project.dir}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <MessageSquare className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm line-clamp-2 leading-snug">
                    {session.conversation.title}
                  </div>
                  <a
                    href={session.conversation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Open
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Git section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Changes
                  </span>
                </div>
                {session.git.branch && (
                  <Badge
                    variant="secondary"
                    className="text-xs font-mono h-5 px-1.5"
                  >
                    {session.git.branch}
                  </Badge>
                )}
              </div>

              {session.git.commitMessage && (
                <div className="text-xs italic text-muted-foreground border-l-2 border-muted-foreground/20 pl-2.5 py-0.5">
                  {session.git.commitMessage}
                </div>
              )}

              {session.git.files.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                  No changes
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {session.git.files.map((f) => (
                    <li
                      key={f.path}
                      className="group flex items-start gap-2 text-xs py-1 px-1.5 -mx-1.5 rounded hover:bg-muted/60 transition-colors"
                    >
                      <span
                        className={cn(
                          "font-mono font-bold shrink-0 w-3 text-center",
                          f.status === "created"
                            ? "text-green-600"
                            : "text-amber-600",
                        )}
                      >
                        {f.status === "created" ? "+" : "~"}
                      </span>
                      <span className="break-all font-mono leading-relaxed">
                        {shortPath(f.path)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
