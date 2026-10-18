// Utilidades de fechas en formato local 'YYYY-MM-DD' (sin horas ni zonas horarias).
// Todas las operaciones se hacen en UTC sobre fechas "calendario" para evitar
// corrimientos por horario de verano o zona horaria del navegador.

export type ISODate = string

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now)
}

export function parseISO(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

export function isValidISO(s?: string): s is ISODate {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const { y, m, d } = parseISO(s)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

export function fromParts(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`
}

const toUTC = (s: ISODate) => {
  const { y, m, d } = parseISO(s)
  return Date.UTC(y, m - 1, d)
}

const fromUTC = (t: number): ISODate => {
  const d = new Date(t)
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number) {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromUTC(toUTC(s) + n * 864e5)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / 864e5)
}

/** Suma meses conservando el día; si no existe (31/feb) se ajusta al último día del mes. */
export function addMonthsClamped(s: ISODate, n: number, preferredDay?: number): ISODate {
  const { y, m, d } = parseISO(s)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const day = Math.min(preferredDay ?? d, daysInMonth(ny, nm))
  return fromParts(ny, nm, day)
}

export function monthsBetween(a: ISODate, b: ISODate) {
  const pa = parseISO(a)
  const pb = parseISO(b)
  return (pb.y - pa.y) * 12 + (pb.m - pa.m)
}

/** 0 = domingo … 6 = sábado */
export function weekday(s: ISODate) {
  return new Date(toUTC(s)).getUTCDay()
}

export function isWeekend(s: ISODate) {
  const w = weekday(s)
  return w === 0 || w === 6
}

/**
 * Regla de días hábiles de Autosol:
 * Sábado y domingo no se trabaja.
 * - Si cae SÁBADO: pasa al día hábil anterior -> VIERNES (-1 día).
 * - Si cae DOMINGO: pasa al día hábil posterior -> LUNES (+1 día).
 */
export function adjustWeekendToBusinessDay(s: ISODate): ISODate {
  const w = weekday(s)
  if (w === 6) return addDays(s, -1) // Sábado -> Viernes
  if (w === 0) return addDays(s, 1)  // Domingo -> Lunes
  return s
}

/** Devuelve el siguiente día hábil a partir de una fecha dada (excluyendo fines de semana). */
export function nextBusinessDay(s: ISODate): ISODate {
  let next = addDays(s, 1)
  while (isWeekend(next)) {
    next = addDays(next, 1)
  }
  return next
}

/** Devuelve el próximo lunes a partir de una fecha dada. */
export function nextMonday(s: ISODate): ISODate {
  const w = weekday(s) // 0 domingo, 1 lunes... 6 sábado
  const daysUntilMonday = (8 - (w === 0 ? 7 : w)) % 7 || 7
  return addDays(s, daysUntilMonday)
}

/** Semana ISO-8601: 'YYYY-Www' */
export function isoWeekKey(s: ISODate): string {
  const t = new Date(toUTC(s))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((t.getTime() - yearStart) / 864e5 + 1) / 7)
  return `${t.getUTCFullYear()}-W${pad(week)}`
}

export function startOfWeek(s: ISODate): ISODate {
  const w = weekday(s) || 7
  return addDays(s, 1 - w)
}

export function monthKey(s: ISODate) {
  return s.slice(0, 7)
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + '01'
}

export function endOfMonth(s: ISODate): ISODate {
  const { y, m } = parseISO(s)
  return fromParts(y, m, daysInMonth(y, m))
}

export function quarterOf(s: ISODate) {
  return Math.floor((parseISO(s).m - 1) / 3) + 1
}

export function maxDate(...ds: (ISODate | undefined)[]): ISODate {
  return ds.filter(Boolean).sort().at(-1) as ISODate
}

export function minDate(...ds: (ISODate | undefined)[]): ISODate {
  return ds.filter(Boolean).sort()[0] as ISODate
}

// ---- Formatos para la interfaz (es-AR) ----

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function monthName(m: number) {
  return MONTHS[m - 1]
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return `${capitalize(MONTHS[m - 1])} ${y}`
}

export function weekdayName(s: ISODate, short = false) {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[weekday(s)]
}

export function weekdayNameByIndex(i: number) {
  return WEEKDAYS[i]
}

export function shortDate(s: ISODate) {
  const { m, d } = parseISO(s)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

export function longDate(s: ISODate) {
  const { y, m, d } = parseISO(s)
  return `${capitalize(weekdayName(s))} ${d} de ${MONTHS[m - 1]} de ${y}`
}

/** 'Hoy', 'Mañana', 'Ayer', 'lun 20 oct' … */
export function relativeLabel(s: ISODate, today: ISODate) {
  const diff = diffDays(s, today)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  const { y } = parseISO(s)
  const base = `${weekdayName(s, true)} ${shortDate(s)}`
  return y === parseISO(today).y ? base : `${base} ${y}`
}

export function formatDateTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${shortDate(toISO(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

