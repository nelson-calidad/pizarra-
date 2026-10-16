// Motor de recurrencias.
// Calcula, para una actividad maestra, las ocurrencias que caen dentro de un rango.
// Cada ocurrencia se identifica por PERÍODO (no por fecha) para que:
//  - una actividad realizada no reaparezca como pendiente en el mismo período,
//  - un cambio del día dentro del período no genere duplicados,
//  - recargas o dos equipos generen exactamente el mismo ID (idempotencia).

import type { Activity, Branch, BranchScope, Execution, PlannerEvent } from '../types'
import {
  addDays, addMonthsClamped, diffDays, isoWeekKey, isValidISO, isWeekend,
  maxDate, minDate, monthsBetween, parseISO, quarterOf, type ISODate
} from './dates'

export type Occurrence = {
  period: string
  dueDate: ISODate
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

/** Fechas (sin sucursal) de la regla dentro de [from, to]. */
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
    // Primer día >= lower alineado al intervalo desde la fecha inicial.
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
    const anchorDay = parseISO(a.startDate).d
    let k = Math.max(0, Math.floor(monthsBetween(a.startDate, lower) / step) - 1)
    let guard = 0
    while (guard++ < 1000) {
      const d = addMonthsClamped(a.startDate, k * step, anchorDay)
      if (d > upper) break
      if (d >= lower) out.push(d)
      k++
    }
    return out
  }

  return out
}

/** Ocurrencias de una actividad dentro de [from, to], incluyendo sucursales y eventos. */
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
      // Eventos ya ocurridos antes de que exista (o cambie) la regla no generan tareas retroactivas.
      // Un evento futuro sí genera sus tareas aunque la fecha de preparación ya haya pasado.
      if (lowerBound && ev.date < lowerBound) continue
      for (const b of activityBranches(a, ev.branch)) {
        out.push({ period: periodKey(a, due, ev.id), dueDate: due, branch: b, eventId: ev.id })
      }
    }
    return out
  }
  const out: Occurrence[] = []
  for (const d of ruleDates(a, from, to)) {
    for (const b of activityBranches(a)) out.push({ period: periodKey(a, d), dueDate: d, branch: b })
  }
  return out
}

export function virtualExecution(a: Activity, o: Occurrence, nowIso: string): Execution {
  return {
    id: executionId(a.id, o.period, o.branch),
    activityId: a.id,
    period: o.period,
    branch: o.branch,
    dueDate: o.dueDate,
    executor: a.responsible,
    status: 'PENDIENTE',
    eventId: o.eventId,
    activityName: a.name,
    createdAt: nowIso,
    virtual: true
  }
}
