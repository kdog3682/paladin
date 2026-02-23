// @paladin/web/src/components/SettingsModal.tsx

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Settings, Bot } from "lucide-react"
import { useSettingsStore, type ModelAlias, type ProjectType } from "../stores/settings"

const TABS = [
  { id: "agentic", label: "Agentic", icon: Bot },
] as const

type TabId = (typeof TABS)[number]["id"]

const MODELS: { alias: ModelAlias; label: string; description: string }[] = [
  { alias: "haiku", label: "Haiku", description: "Fast, lightweight tasks" },
  { alias: "sonnet", label: "Sonnet", description: "Balanced performance" },
  { alias: "opus", label: "Opus", description: "Maximum capability" },
]

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "typescript", label: "TypeScript Monorepo" },
  { value: "python", label: "Python (coming soon)" },
]

export function SettingsModal() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>("agentic")
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)
  const projectType = useSettingsStore((s) => s.projectType)
  const setProjectType = useSettingsStore((s) => s.setProjectType)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded hover:bg-accent transition-colors"
        title="Settings"
      >
        <Settings className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-card border-border p-0">
          <div className="flex h-80">
            {/* Sidebar */}
            <div className="w-36 border-r border-border p-2 space-y-1">
              <DialogHeader className="px-2 pb-2">
                <DialogTitle className="text-sm text-foreground">Settings</DialogTitle>
              </DialogHeader>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`
                    w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors
                    ${tab === t.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }
                  `}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Detail */}
            <div className="flex-1 p-4 space-y-6">
              {tab === "agentic" && (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-3">Model</h3>
                    <div className="space-y-1.5">
                      {MODELS.map((m) => (
                        <button
                          key={m.alias}
                          onClick={() => setModel(m.alias)}
                          className={`
                            w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors border
                            ${model === m.alias
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:bg-accent/50 text-muted-foreground"
                            }
                          `}
                        >
                          <span className="font-medium">{m.label}</span>
                          <span className="text-xs">{m.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-3">Project Type</h3>
                    <div className="space-y-1.5">
                      {PROJECT_TYPES.map((pt) => (
                        <button
                          key={pt.value}
                          onClick={() => {
                            if (pt.value !== "python") setProjectType(pt.value)
                          }}
                          disabled={pt.value === "python"}
                          className={`
                            w-full flex items-center px-3 py-2 rounded-md text-sm transition-colors border
                            ${projectType === pt.value
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:bg-accent/50 text-muted-foreground"
                            }
                            disabled:opacity-40 disabled:cursor-not-allowed
                          `}
                        >
                          {pt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
