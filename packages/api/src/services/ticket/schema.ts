// src/services/ticket/schema.ts

import { getDb } from '../../db'
import type { TicketRow, TicketFileRow } from '../../types'

function db() {
  return getDb()
}

export function insertTicket(row: Omit<TicketRow, 'created_at' | 'updated_at'>) {
  const stmt = db().prepare(`
    INSERT INTO tickets (name, keywords, file_source_type, file_source_name)
    VALUES ($name, $keywords, $file_source_type, $file_source_name)
  `)
  stmt.run({
    $name: row.name,
    $keywords: row.keywords,
    $file_source_type: row.file_source_type,
    $file_source_name: row.file_source_name,
  })
}

export function updateTicket(name: string, fields: Partial<Pick<TicketRow, 'keywords' | 'file_source_type' | 'file_source_name'>>) {
  const sets: string[] = ["updated_at = datetime('now')"]
  const params: Record<string, string> = { $name: name }

  if (fields.keywords !== undefined) {
    sets.push('keywords = $keywords')
    params.$keywords = fields.keywords
  }
  if (fields.file_source_type !== undefined) {
    sets.push('file_source_type = $file_source_type')
    params.$file_source_type = fields.file_source_type
  }
  if (fields.file_source_name !== undefined) {
    sets.push('file_source_name = $file_source_name')
    params.$file_source_name = fields.file_source_name
  }

  db().prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE name = $name`).run(params)
}

export function getTicket(name: string): TicketRow | null {
  return db().prepare('SELECT * FROM tickets WHERE name = $name').get({ $name: name }) as TicketRow | null
}

export function listTickets(sinceDays = 7): TicketRow[] {
  return db().prepare(`
    SELECT * FROM tickets
    WHERE updated_at >= datetime('now', $offset)
    ORDER BY updated_at DESC
  `).all({ $offset: `-${sinceDays} days` }) as TicketRow[]
}

export function deleteTicket(name: string) {
  db().prepare('DELETE FROM tickets WHERE name = $name').run({ $name: name })
}

export function insertTicketFile(row: TicketFileRow) {
  db().prepare(`
    INSERT OR REPLACE INTO ticket_files (ticket_name, path, notes)
    VALUES ($ticket_name, $path, $notes)
  `).run({
    $ticket_name: row.ticket_name,
    $path: row.path,
    $notes: row.notes,
  })
}

export function getTicketFiles(ticketName: string): TicketFileRow[] {
  return db().prepare(
    'SELECT * FROM ticket_files WHERE ticket_name = $name',
  ).all({ $name: ticketName }) as TicketFileRow[]
}

export function updateTicketFileNotes(ticketName: string, path: string, notes: string) {
  db().prepare(`
    UPDATE ticket_files SET notes = $notes WHERE ticket_name = $name AND path = $path
  `).run({ $notes: notes, $name: ticketName, $path: path })
}

export function deleteTicketFiles(ticketName: string) {
  db().prepare('DELETE FROM ticket_files WHERE ticket_name = $name').run({ $name: ticketName })
}
