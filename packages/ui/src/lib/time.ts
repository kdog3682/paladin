/* 5:03 PM, in the viewer's locale */
export const fmtTime = (at: string | number | Date) =>
  new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/* "Sep 19" for anything older than today, otherwise the time */
export const fmtStamp = (at: string | number | Date) => {
  const d = new Date(at)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  return sameDay ? fmtTime(d) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
