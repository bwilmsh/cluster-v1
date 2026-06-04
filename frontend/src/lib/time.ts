export function toLocalISOWithOffset(d: Date) {
  const tzOffset = -d.getTimezoneOffset()
  const absOffset = Math.abs(tzOffset)
  const sign = tzOffset >= 0 ? '+' : '-'
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const minutes = String(absOffset % 60).padStart(2, '0')
  const iso = d.toISOString().replace('Z', '')
  return `${iso}${sign}${hours}:${minutes}`
}

export function parseISOToLocal(dateStr: string) {
  return new Date(dateStr)
}
