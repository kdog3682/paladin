// src/components/SessionMonitor/Sidebar.tsx

import { Card, CardContent, CardHeader, CardTitle, Badge, Separator, ScrollArea, cn } from "@bklearn/shadcn"
import type { SessionData } from "./types"

interface SidebarProps {
  session: SessionData | null
  connected: boolean
}

function shortPath(p: string) {
  const parts = p.split("/")
  const idx = parts.findIndex((x) => x === "packages")
  if (idx >= 0 && idx + 1 < parts.length) return parts.slice(idx + 1).join("/")
  return parts.slice(-3).join("/")
}

export function Sidebar({ session, connected }: SidebarProps) {
  return (
    <div className="flex flex-col gap-4 p-4 w-80 border-r bg-muted/30 h-full overflow-y-auto">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            connected ? "bg-green-500" : "bg-muted-foreground/40",
          )}
        />
        <span className="text-xs text-muted-foreground">
          {connected ? "connected" : "disconnected"}
        </span>
      </div>

      {!session ? (
        <div className="text-sm text-muted-foreground">
          Waiting for session...
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Project</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="font-medium">{session.project.name}</div>
              <div className="text-xs text-muted-foreground break-all">
                {session.project.dir}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Conversation</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="font-medium line-clamp-2">
                {session.conversation.title}
              </div>
              <a
                href={session.conversation.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline break-all"
              >
                {session.conversation.url}
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Git</CardTitle>
              {session.git.branch && (
                <Badge variant="secondary" className="text-xs">
                  {session.git.branch}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {session.git.commitMessage && (
                <>
                  <div className="text-xs font-medium text-muted-foreground">
                    commit
                  </div>
                  <div className="text-sm italic">
                    {session.git.commitMessage}
                  </div>
                  <Separator />
                </>
              )}

              {session.git.files.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No changes
                </div>
              ) : (
                <ScrollArea className="max-h-60">
                  <ul className="space-y-1">
                    {session.git.files.map((f) => (
                      <li
                        key={f.path}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span
                          className={cn(
                            "font-mono shrink-0",
                            f.status === "created"
                              ? "text-green-600"
                              : "text-amber-600",
                          )}
                        >
                          {f.status === "created" ? "+" : "~"}
                        </span>
                        <span className="break-all">{shortPath(f.path)}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
