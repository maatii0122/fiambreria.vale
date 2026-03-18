const ART_OFFSET_MS = 3 * 60 * 60 * 1000

export const nowART = () => new Date(Date.now() - ART_OFFSET_MS)

export const startOfDayART = (date = new Date()) => {
  const a = new Date(date.getTime() - ART_OFFSET_MS)
  return new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) + ART_OFFSET_MS)
}

export const startOfWeekART = (date = new Date()) => {
  const d = startOfDayART(date)
  const day = new Date(d.getTime() - ART_OFFSET_MS).getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  return new Date(d.getTime() - diff * 86400000)
}

export const startOfMonthART = (date = new Date()) => {
  const a = new Date(date.getTime() - ART_OFFSET_MS)
  return new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1) + ART_OFFSET_MS)
}

export const startOfYearART = (date = new Date()) => {
  const a = new Date(date.getTime() - ART_OFFSET_MS)
  return new Date(Date.UTC(a.getUTCFullYear(), 0, 1) + ART_OFFSET_MS)
}

export const formatDateTimeART = (dateStr) => {
  if (!dateStr) return ''
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr))
}

export const formatDateOnlyART = (dateStr) => {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

export const fmtMoney = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n || 0)
