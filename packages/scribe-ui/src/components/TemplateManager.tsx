// @paladin/scribe-ui/src/components/TemplateManager.tsx

import { useState, useEffect } from "react"
import { useStore } from "../store"
import * as api from "../api"
import type { Template } from "../types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bklearn/shadcn"
import { Input } from "@bklearn/shadcn"
import { Button } from "@bklearn/shadcn"
import { Plus, Trash2 } from "lucide-react"

export function TemplateManager() {
  const { templates, setTemplateManagerOpen, loadTemplates } = useStore()

  const [localTemplates, setLocalTemplates] = useState<Template[]>(templates)
  const [selectedKey, setSelectedKey] = useState<string | null>(templates[0]?.key ?? null)
  const [editName, setEditName] = useState("")
  const [editContent, setEditContent] = useState("")

  // Sync from store when templates reload
  useEffect(() => {
    setLocalTemplates(templates)
  }, [templates])

  const selected = localTemplates.find((t) => t.key === selectedKey) ?? null

  useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditContent(selected.content)
    } else {
      setEditName("")
      setEditContent("")
    }
  }, [selectedKey, selected?.key])

  const handleSave = async () => {
    if (!selected) return
    await api.templates.update(selected.key, { name: editName, content: editContent })
    await loadTemplates()
  }

  const handleCreate = async () => {
    const created = await api.templates.create({
      name: "New Template",
      content: "{{source-files}}\n{{instructions}}",
    })
    await loadTemplates()
    // Select the newly created template
    setSelectedKey(created.key)
    setEditName(created.name)
    setEditContent(created.content)
  }

  const handleDelete = async () => {
    if (!selected) return
    await api.templates.delete(selected.key)
    setSelectedKey(null)
    await loadTemplates()
  }

  return (
    <Dialog open onOpenChange={() => setTemplateManagerOpen(false)}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Sidebar */}
          <div className="w-48 flex flex-col border-r pr-4">
            <div className="flex-1 overflow-y-auto space-y-1">
              {localTemplates.map((t) => (
                <div
                  key={t.key}
                  className={`px-2 py-1.5 rounded-sm cursor-pointer text-sm truncate ${
                    selectedKey === t.key ? "bg-accent font-medium" : "hover:bg-accent/50"
                  }`}
                  onClick={() => setSelectedKey(t.key)}
                >
                  {t.name}
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={handleCreate} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>

          {/* Editor */}
          {selected ? (
            <div className="flex-1 flex flex-col gap-3">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Template name"
              />
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Template content… use {{instructions}} and {{source-files}}"
                className="flex-1 min-h-48 w-full resize-none border rounded-md bg-transparent p-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-between">
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTemplateManagerOpen(false)}>
                    Close
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select or create a template
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
