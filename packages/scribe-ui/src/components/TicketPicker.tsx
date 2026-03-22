// @paladin/scribe-ui/src/components/TicketPicker.tsx

import { useState, useEffect, useRef } from "react"
import { useStore } from "../store"
import * as api from "../api"
import type { Ticket } from "../types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bklearn/shadcn"
import { Input } from "@bklearn/shadcn"
import { Button } from "@bklearn/shadcn"
import { Badge } from "@bklearn/shadcn"
import { Plus, Copy, Trash2 } from "lucide-react"

export function TicketPicker() {
  const { setTicketPickerOpen, loadTicket, newTicket, duplicateTicket, saveTicket, isDirty } = useStore()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [query, setQuery] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    fetchTickets()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchTickets(query), 200)
    return () => clearTimeout(t)
  }, [query])

  const fetchTickets = async (q?: string) => {
    const data = await api.tickets.list(q ? { q } : undefined)
    setTickets(data)
    setSelectedIdx(0)
  }

  const handleOpen = async (ticket: Ticket) => {
    if (isDirty) await saveTicket()
    await loadTicket(ticket.id)
    setTicketPickerOpen(false)
  }

  const handleNew = () => {
    newTicket()
    setTicketPickerOpen(false)
  }

  const handleDuplicate = async (ticket: Ticket) => {
    await loadTicket(ticket.id)
    await duplicateTicket()
    setTicketPickerOpen(false)
  }

  const handleDelete = async (ticket: Ticket) => {
    await api.tickets.delete(ticket.id)
    fetchTickets(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setTicketPickerOpen(false)
      return
    }
    if (e.key === "Enter" && tickets[selectedIdx]) {
      handleOpen(tickets[selectedIdx])
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, tickets.length - 1))
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    archived: "bg-gray-500/10 text-gray-500",
    suspended: "bg-yellow-500/10 text-yellow-600",
    completed: "bg-blue-500/10 text-blue-600",
  }

  return (
    <Dialog open onOpenChange={() => setTicketPickerOpen(false)}>
      <DialogContent className="max-w-xl max-h-[70vh] flex flex-col" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Open Ticket</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets…"
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={handleNew}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md mt-2">
          {tickets.length === 0 ? (
            <div className="p-4 text-sm text-center text-muted-foreground">
              No tickets found
            </div>
          ) : (
            tickets.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm group ${
                  i === selectedIdx ? "bg-accent" : "hover:bg-accent/50"
                }`}
                onClick={() => handleOpen(t)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.body.slice(0, 80)}{t.body.length > 80 ? "…" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                  <Badge className={`text-[10px] ${STATUS_COLORS[t.status] ?? ""}`}>
                    {t.status}
                  </Badge>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicate(t)
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(t)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
