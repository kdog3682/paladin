// src/services/ticket/index.ts

import type { Ticket, TicketFile, FileSourceType } from '../../types'
import * as schema from './schema'
import { determineKeywords, stubName, buildExportPayload } from './helpers'

type CreateTicketInput = {
  fileSource: {
    type: FileSourceType
    name: string
  }
  files: { path: string, notes?: string[] }[]
}

export function create(input: CreateTicketInput): Ticket {
  const files: TicketFile[] = input.files.map((f) => ({
    path: f.path,
    notes: f.notes ?? [],
  }))

  const keywords = determineKeywords(files)
  const name = stubName(keywords)

  schema.insertTicket({
    name,
    keywords: JSON.stringify(keywords),
    file_source_type: input.fileSource.type,
    file_source_name: input.fileSource.name,
  })

  for (const file of files) {
    schema.insertTicketFile({
      ticket_name: name,
      path: file.path,
      notes: JSON.stringify(file.notes),
    })
  }

  return {
    name,
    keywords,
    fileSourceType: input.fileSource.type,
    fileSourceName: input.fileSource.name,
    files,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function get(name: string): Ticket | null {
  const row = schema.getTicket(name)
  if (!row) return null

  const fileRows = schema.getTicketFiles(name)

  return {
    name: row.name,
    keywords: JSON.parse(row.keywords),
    fileSourceType: row.file_source_type,
    fileSourceName: row.file_source_name,
    files: fileRows.map((f) => ({
      path: f.path,
      notes: JSON.parse(f.notes),
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function list(sinceDays = 7): Pick<Ticket, 'name' | 'keywords' | 'updatedAt'>[] {
  const rows = schema.listTickets(sinceDays)
  return rows.map((r) => ({
    name: r.name,
    keywords: JSON.parse(r.keywords),
    updatedAt: r.updated_at,
  }))
}

export function deleteTicket(name: string): boolean {
  const ticket = schema.getTicket(name)
  if (!ticket) return false
  schema.deleteTicketFiles(name)
  schema.deleteTicket(name)
  return true
}

export function updateNotes(name: string, fileUpdates: { path: string, notes: string[] }[]) {
  for (const update of fileUpdates) {
    schema.updateTicketFileNotes(name, update.path, JSON.stringify(update.notes))
  }

  const ticket = get(name)
  if (ticket) {
    const keywords = determineKeywords(ticket.files)
    schema.updateTicket(name, { keywords: JSON.stringify(keywords) })
  }
}

export function addFile(ticketName: string, path: string, notes: string[] = []) {
  schema.insertTicketFile({
    ticket_name: ticketName,
    path,
    notes: JSON.stringify(notes),
  })

  const ticket = get(ticketName)
  if (ticket) {
    const keywords = determineKeywords(ticket.files)
    schema.updateTicket(ticketName, { keywords: JSON.stringify(keywords) })
  }
}

export async function exportPayload(name: string, promptDir?: string): Promise<string | null> {
  const ticket = get(name)
  if (!ticket) return null
  return buildExportPayload(ticket.files, promptDir)
}

export function clearNotes(name: string) {
  const fileRows = schema.getTicketFiles(name)
  for (const f of fileRows) {
    schema.updateTicketFileNotes(name, f.path, '[]')
  }
}

export function save(name: string): Ticket | null {
  const ticket = get(name)
  if (!ticket) return null

  const keywords = determineKeywords(ticket.files)
  schema.updateTicket(name, { keywords: JSON.stringify(keywords) })

  return get(name)
}
/*


*/