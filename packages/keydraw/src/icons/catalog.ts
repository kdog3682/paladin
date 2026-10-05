/* the curated lucide set offered by the icon picker (`:icon` accepts any lucide name) */
export const ICON_CATALOG = [
  "chevron-up", "chevron-down", "chevron-left", "chevron-right",
  "arrow-up", "arrow-down", "arrow-left", "arrow-right",
  "x", "check", "plus", "minus", "search", "menu", "more-horizontal", "more-vertical",
  "user", "users", "settings", "trash", "edit", "copy", "save", "download", "upload",
  "home", "mail", "bell", "calendar", "clock", "heart", "star", "bookmark", "share",
  "link", "image", "file", "folder", "lock", "unlock", "eye", "eye-off",
  "info", "alert-circle", "alert-triangle", "help-circle", "play", "pause",
  "sun", "moon", "globe", "shopping-cart", "credit-card", "phone", "map-pin", "filter", "refresh-cw", "log-out",
]

/* "chevron-down" → "ChevronDown" */
export function pascal(name: string): string {
  return name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())
}
