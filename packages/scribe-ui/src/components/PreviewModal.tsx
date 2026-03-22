// @paladin/scribe-ui/src/components/PreviewModal.tsx

import { useEffect, useState } from "react"
import { useStore } from "../store"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bklearn/shadcn"
import { Badge } from "@bklearn/shadcn"

export function PreviewModal() {
  const { body, sourceFiles, setPreviewOpen } = useStore()

  return (
    <Dialog open onOpenChange={() => setPreviewOpen(false)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Instructions */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Instructions</h3>
            <div className="border rounded-md p-4 text-sm whitespace-pre-wrap">{body}</div>
          </div>

          {/* Source files as pills */}
          {sourceFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Source Files</h3>
              <div className="flex flex-wrap gap-2">
                {sourceFiles.map((f) => (
                  <Badge key={f} variant="secondary" className="font-mono text-xs px-3 py-1">
                    {f.split("/").pop()}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
