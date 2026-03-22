// @paladin/scribe-ui/src/components/FileGroupSaveModal.tsx

import { useState } from "react"
import { useStore } from "../store"
import * as api from "../api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bklearn/shadcn"
import { Input } from "@bklearn/shadcn"
import { Button } from "@bklearn/shadcn"
import { Badge } from "@bklearn/shadcn"

export function FileGroupSaveModal() {
  const { sourceFiles, name, setFileGroupSaveOpen } = useStore()
  const [groupName, setGroupName] = useState("")

  const handleSave = async () => {
    await api.fileGroups.create({
      name: groupName.trim() || name || "Unnamed Group",
      files: sourceFiles,
    })
    setFileGroupSaveOpen(false)
  }

  return (
    <Dialog open onOpenChange={() => setFileGroupSaveOpen(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save File Group</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={name || "Group name"}
            autoFocus
          />

          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {sourceFiles.length} file{sourceFiles.length !== 1 ? "s" : ""} to save:
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {sourceFiles.map((f) => (
                <Badge key={f} variant="secondary" className="text-xs font-mono">
                  {f.split("/").pop()}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setFileGroupSaveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={sourceFiles.length === 0}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
