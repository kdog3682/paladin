import { HelpPalette, type HelpItem } from '@paladin/ui'

const ITEMS: HelpItem[] = [
  { group: 'Notes', title: 'New note', shortcut: 'alt+N' },
  { group: 'Notes', title: 'Rename', shortcut: 'alt+R' },
  { group: 'Notes', title: 'Delete', shortcut: 'alt+D' },
  { group: 'Notes', title: 'Copy', shortcut: 'alt+C' },
  { group: 'Notes', title: 'Export', shortcut: 'alt+E' },
  { group: 'Navigate', title: 'Search notes', shortcut: 'cmd+K' },
  { group: 'Navigate', title: 'Previous note', shortcut: 'alt+up' },
  { group: 'Navigate', title: 'Next note', shortcut: 'alt+down' },
  { group: 'Bookmarks', title: 'Set bookmark 1-0', shortcut: 'alt+shift+1' },
  { group: 'Bookmarks', title: 'Go to bookmark 1-0', shortcut: 'alt+1' },
  { group: 'Help', title: 'This help', shortcut: 'cmd+/' },
]

export type NoteHelpProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const NoteHelp = ({ open, onOpenChange }: NoteHelpProps) => (
  <HelpPalette items={ITEMS} open={open} onOpenChange={onOpenChange} />
)
