// Motor de recurrencias.
// Calcula, para una actividad maestra, las ocurrencias que caen dentro de un rango.
// Cada ocurrencia se identifica por PERÍODO (no por fecha) para que:
//  - una actividad realizada no reaparezca como pendiente en el mismo período,
//  - una actividad con ventana (ej. del 7 al 10) genere UNA SOLA ejecución en ese período,
//  - recargas o dos equipos generen exactamente el mismo ID (idempotencia).

import type { Activity, Branch, BranchScope, Execution, PlannerEvent } from '../types'
import {
  addDays, addMonthsClamped, daysInMonth, diffDays, fromParts, isoWeekKey, isValidISO,
  isWeekend, maxDate, minDate, monthsBetween, parseISO, quarterOf, startOfWeek, weekday,
  type ISODate
} from './dates'

export type Occurrence = {
  period: string
  dueDate: ISODate
  windowStart?: ISODate
  branch: BranchScope
  eventId?: string
}

const MONTH_STEP: Partial<Record<Activity['frequency'], number>> = {
  MENSUAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12
}

export function periodKey(a: Pick<Activity, 'frequency'>, date: ISODate, eventId?: string): string {
  switch (a.frequency) {
    case 'UNICA': return 'U'
    case 'DIARIA': return date
    case 'SEMANAL': return isoWeekKey(date)
    case 'MENSUAL': return date.slice(0, 7)
    case 'TRIMESTRAL': return `${parseISO(date).y}-Q${quarterOf(date)}`
    case 'SEMESTRAL': return `${parseISO(date).y}-S${parseISO(date).m <= 6 ? 1 : 2}`
    case 'ANUAL': return String(parseISO(date).y)
    case 'EVENTO': return `E-${eventId}`
  }
}

export function executionId(activityId: string, period: string, branch: BranchScope) {
  return `${activityId}__${period}__${branch}`
}

/** Sucursales en las que se registra la actividad. */
export function activityBranches(a: Pick<Activity, 'branch' | 'splitBranches'>, eventBranch?: BranchScope): BranchScope[] {
  let base: BranchScope[] =
    a.branch === 'AMBAS' ? (a.splitBranches ? ['JUJUY', 'SALTA'] : ['AMBAS']) : [a.branch]
  if (eventBranch && eventBranch !== 'AMBAS') {
    if (a.branch !== 'AMBAS' && a.branch !== eventBranch) return []
    base = [eventBranch as Branch]
  }
  return base
}

/** Si solo hábiles está activo en una fecha mensual/anual y cae fin de semana, corre al lunes (o viernes si cambia de mes). */
function adjustToBusinessDayInMonth(d: ISODate): ISODate {
  const w = weekday(d)
  if (w !== 0 && w !== 6) return d
  const shiftForward = w === 6 ? 2 : 1
  const next = addDays(d, shiftForward)
  if (next.slice(0, 7) === d.slice(0, 7)) return next
  return addDays(d, w === 6 ? -1 : -2)
}

/** Calcula inicio de ventana para una fecha de vencimiento dada. */
export function computeWindowStart(a: Activity, dueDate: ISODate): ISODate | undefined {
  if (a.frequency === 'SEMANAL' && a.flexible) {
    return startOfWeek(dueDate)
  }
  if (
    MONTH_STEP[a.frequency] &&
    a.windowStartDay &&
    a.windowEndDay &&
    a.windowEndDay >= a.windowStartDay
  ) {
    const { y, m } = parseISO(dueDate)
    const maxD = daysInMonth(y, m)
    const startD = Math.min(Math.max(1, a.windowStartDay), maxD)
    return fromParts(y, m, startD)
  }
  return undefined
}

/** Fechas de vencimiento (sin sucursal) de la regla dentro de [from, to]. */
export function ruleDates(a: Activity, from: ISODate, to: ISODate): ISODate[] {
  if (!isValidISO(a.startDate)) return []
  const lower = maxDate(from, a.startDate, isValidISO(a.effectiveFrom) ? a.effectiveFrom : undefined)
  const upper = isValidISO(a.endDate) ? minDate(to, a.endDate) : to
  if (lower > upper) return []
  const interval = Math.max(1, Math.floor(Number(a.interval) || 1))
  const out: ISODate[] = []

  if (a.frequency === 'UNICA') {
    if (a.startDate >= lower && a.startDate <= upper) out.push(a.startDate)
    return out
  }

  if (a.frequency === 'DIARIA') {
    const offset = diffDays(lower, a.startDate)
    let d = addDays(a.startDate, Math.ceil(offset / interval) * interval)
    let guard = 0
    while (d <= upper && guard++ < 5000) {
      if (!(a.businessDaysOnly && isWeekend(d))) out.push(d)
      d = addDays(d, interval)
    }
    return out
  }

  if (a.frequency === 'SEMANAL') {
    const step = 7 * interval
    const offset = diffDays(lower, a.startDate)
    let d = addDays(a.startDate, Math.max(0, Math.ceil(offset / step)) * step)
    let guard = 0
    while (d <= upper && guard++ < 2000) {
      out.push(d)
      d = addDays(d, step)
    }
    return out
  }

  const monthStep = MONTH_STEP[a.frequency]
  if (monthStep) {
    const step = monthStep * interval
    // Si tiene ventana (ej. del 7 al 10), la fecha de vencimiento de la única ejecución es el fin de ventana (10)
    const hasWindow =
      a.windowStartDay !== undefined &&
      a.windowEndDay !== undefined &&
      a.windowEndDay >= a.windowStartDay
    const anchorDay = hasWindow ? a.windowEndDay! : parseISO(a.startDate).d
    const effectiveStart = hasWindow
      ? fromParts(parseISO(a.startDate).y, parseISO(a.startDate).m, 1)
      : a.startDate
    const effectiveLower = hasWindow
      ? maxDate(from, effectiveStart, isValidISO(a.effectiveFrom) ? a.effectiveFrom : undefined)
      : lower

    let k = Math.max(0, Math.floor(monthsBetween(a.startDate, effectiveLower) / step) - 1)
    let guard = 0
    while (guard++ < 1000) {
      let d = addMonthsClamped(a.startDate, k * step, anchorDay)
      if (!hasWindow && a.businessDaysOnly) {
        d = adjustToBusinessDayInMonth(d)
      }
      const winStart = computeWindowStart(a, d)
      // Incluir si el vencimiento cae en [effectiveLower, upper] o si su ventana activa se solapa con [from, upper]
      const inRange =
        (d >= effectiveLower && d <= upper) ||
        (winStart !== undefined && winStart <= upper && d >= from && d >= effectiveStart)
      if (d > upper && (!winStart || winStart > upper)) break
      if (inRange) out.push(d)
      k++
    }
    return out
  }

  return out
}

/** Ocurrencias de una actividad dentro de [from, to], incluyendo sucursales, ventanas y eventos. */
export function occurrences(a: Activity, from: ISODate, to: ISODate, events: PlannerEvent[] = []): Occurrence[] {
  if (a.frequency === 'EVENTO') {
    if (!a.eventType) return []
    const offset = Math.round(Number(a.offsetDays) || 0)
    const lowerBound = isValidISO(a.effectiveFrom) ? a.effectiveFrom : undefined
    const out: Occurrence[] = []
    for (const ev of events) {
      if (ev.state === 'CANCELADO' || ev.type !== a.eventType || !isValidISO(ev.date)) continue
      const due = addDays(ev.date, offset)
      if (due < from || due > to) continue
      if (lowerBound && ev.date < lowerBound) continue
      for (const b of activityBranches(a, ev.branch)) {
        out.push({ period: periodKey(a, due, ev.id), dueDate: due, branch: b, eventId: ev.id })
      }
    }
    return out
  }
  const out: Occurrence[] = []
  for (const d of ruleDates(a, from, to)) {
    const windowStart = computeWindowStart(a, d)
    for (const b of activityBranches(a)) {
      out.push({ period: periodKey(a, d), dueDate: d, windowStart, branch: b })
    }
  }
  return out
}

export function virtualExecution(a: Activity, o: Occurrence, nowIso: string): Execution {
  const mode = a.completionMode || 'CUALQUIERA'
  return {
    id: executionId(a.id, o.period, o.branch),
    activityId: a.id,
    period: o.period,
    branch: o.branch,
    dueDate: o.dueDate,
    windowStart: o.windowStart,
    executor: a.responsible,
    status: 'PENDIENTE',
    eventId: o.eventId,
    activityName: a.name,
    completionMode: mode,
    completionLabel: a.completionLabel,
    participants: mode === 'CONJUNTA' ? ['RAC', 'ANALISTA'] : undefined,
    confirmations: mode === 'AMBOS_INDIVIDUAL' ? {
      RAC: { status: 'PENDIENTE' },
      ANALISTA: { status: 'PENDIENTE' }
    } : undefined,
    createdAt: nowIso,
    virtual: true
  }
}
