import { HelpPalette, type HelpItem } from '@paladin/ui'

const ITEMS: HelpItem[] = [
  { group: 'Notes', title: 'New note', shortcut: 'alt+N' },
  { group: 'Notes', title: 'Rename', shortcut: 'alt+R' },
  { group: 'Notes', title: 'Delete', shortcut: 'alt+D' },
  { group: 'Notes', title: 'Copy current block', shortcut: 'alt+C' },
  { group: 'Notes', title: 'Export', shortcut: 'cmd+E' },
  { group: 'Notes', title: 'Import from JSON', shortcut: 'cmd+O' },
  { group: 'Navigate', title: 'Search notes', shortcut: 'cmd+K' },
  { group: 'Navigate', title: 'Previous note', shortcut: 'alt+up' },
  { group: 'Navigate', title: 'Next note', shortcut: 'alt+down' },
  { group: 'Bookmarks', title: 'Set bookmark 1-0 (normal mode)', shortcut: 'm 1' },
  { group: 'Bookmarks', title: 'Go to bookmark 1-0 (normal mode)', shortcut: 'e 1' },
  { group: 'Folds', title: 'Toggle fold (normal mode)', shortcut: 'z f' },
  { group: 'Help', title: 'This help', shortcut: 'cmd+/' },
]

export type NoteHelpProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const NoteHelp = ({ open, onOpenChange }: NoteHelpProps) => (
  <HelpPalette items={ITEMS} open={open} onOpenChange={onOpenChange} />
)
