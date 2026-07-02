function timeBin(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function weekday(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
}

export function defaultScratchpadName(d = new Date()): string {
  return `${weekday(d)}-${timeBin(d)}`
}

const DATED_TITLE_RE = /^[a-z]+-(morning|afternoon|evening)$/

// 'untitled' is the backend's bare-minimum default (new app install); dated names are ours
export function isUnnamedScratchpad(project: string, title: string): boolean {
  return project === 'scratchpad' && (title === 'untitled' || DATED_TITLE_RE.test(title))
}
