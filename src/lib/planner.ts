// Lógica de planificación: combina actividades, ejecuciones guardadas y eventos.
// Sin dependencias de React: se prueba de forma aislada.

import type { Activity, Execution, ExecStatus, PlannerEvent, Role, BranchScope, Frequency } from '../types'
import { addDays, diffDays, type ISODate } from './dates'
import { occurrences, virtualExecution } from './recurrence'

export type Visual = 'done' | 'notdone' | 'overdue' | 'soon' | 'progress' | 'pending'

export const DEFAULT_LEAD: Record<Frequency, number> = {
  UNICA: 3,
  DIARIA: 0,
  SEMANAL: 1,
  MENSUAL: 3,
  TRIMESTRAL: 7,
  SEMESTRAL: 7,
  ANUAL: 14,
  EVENTO: 3
}

export const isResolved = (s: ExecStatus) => s === 'REALIZADA' || s === 'NO_REALIZADA'

export function leadDaysFor(a?: Pick<Activity, 'frequency' | 'leadDays'>) {
  if (!a) return 3
  const n = Number(a.leadDays)
  return Number.isFinite(n) && a.leadDays !== undefined && a.leadDays !== null ? Math.max(0, n) : DEFAULT_LEAD[a.frequency]
}

/** Estado visual calculado desde la fecha real de la ejecución. */
export function visualState(e: Pick<Execution, 'status' | 'dueDate'>, today: ISODate, lead = 3): Visual {
  if (e.status === 'REALIZADA') return 'done'
  if (e.status === 'NO_REALIZADA') return 'notdone'
  if (e.dueDate < today) return 'overdue'
  if (e.status === 'EN_CURSO') return 'progress'
  if (diffDays(e.dueDate, today) <= lead) return 'soon'
  return 'pending'
}

/**
 * Ejecuciones dentro de [from, to]: las guardadas + las calculadas por las reglas
 * que todavía no existen en la hoja. Nunca duplica (mismo ID determinístico).
 */
export function buildExecutions(
  activities: Activity[],
  persisted: Execution[],
  events: PlannerEvent[],
  from: ISODate,
  to: ISODate,
  nowIso = new Date().toISOString()
): Execution[] {
  const byId = new Map<string, Execution>()
  const known = new Set(activities.map(a => a.id))
  for (const e of persisted) {
    if (e.dueDate >= from && e.dueDate <= to && known.has(e.activityId)) byId.set(e.id, e)
  }
  const allPersistedIds = new Set(persisted.map(e => e.id))
  for (const a of activities) {
    if (a.state !== 'ACTIVA') continue
    for (const o of occurrences(a, from, to, events)) {
      const v = virtualExecution(a, o, nowIso)
      // Si la ejecución existe pero fue reprogramada fuera del rango, no se vuelve a crear.
      if (!byId.has(v.id) && !allPersistedIds.has(v.id)) byId.set(v.id, v)
    }
  }
  return [...byId.values()].sort(compareExecutions)
}

export function compareExecutions(a: Execution, b: Execution) {
  return a.dueDate.localeCompare(b.dueDate) || (a.activityName || '').localeCompare(b.activityName || '') || a.branch.localeCompare(b.branch)
}

/**
 * Ocurrencias ya vencidas o del día que aún no están guardadas: se materializan
 * para que el historial no cambie si luego se modifica la regla o se pausa la actividad.
 */
export function pendingMaterialization(
  activities: Activity[],
  persisted: Execution[],
  events: PlannerEvent[],
  today: ISODate,
  lookbackDays = 400,
  nowIso = new Date().toISOString()
): Execution[] {
  const ids = new Set(persisted.map(e => e.id))
  const from = addDays(today, -lookbackDays)
  const out: Execution[] = []
  for (const a of activities) {
    if (a.state !== 'ACTIVA') continue
    for (const o of occurrences(a, from, today, events)) {
      const v = virtualExecution(a, o, nowIso)
      if (!ids.has(v.id)) {
        ids.add(v.id)
        out.push({ ...v, virtual: false })
      }
    }
  }
  return out
}

/** Una ejecución "intacta" no tiene información cargada por las personas. */
export function isUntouched(e: Execution, a?: Activity) {
  return (
    e.status === 'PENDIENTE' &&
    !e.note && !e.evidence && !e.reason && !e.completedAt &&
    (!a || e.executor === a.responsible)
  )
}

export type RuleReconcile = { update: { id: string; dueDate: string }[]; remove: string[] }

/**
 * Tras cambiar la regla de una actividad: ajusta ejecuciones futuras pendientes.
 * - Si la nueva regla produce el mismo período → se actualiza la fecha.
 * - Si no y no tiene datos cargados → se elimina (era una previsión de la regla anterior).
 * - El historial (fechas pasadas o ejecuciones con datos) nunca se toca.
 */
export function reconcileAfterRuleChange(
  next: Activity,
  persisted: Execution[],
  events: PlannerEvent[],
  today: ISODate
): RuleReconcile {
  const mine = persisted.filter(e => e.activityId === next.id && e.dueDate >= today && e.status === 'PENDIENTE')
  if (!mine.length) return { update: [], remove: [] }
  const horizon = addDays(mine.map(e => e.dueDate).sort().at(-1)!, 400)
  const fresh = new Map<string, string>()
  if (next.state === 'ACTIVA') {
    for (const o of occurrences(next, today, horizon, events)) {
      const v = virtualExecution(next, o, '')
      fresh.set(v.id, o.dueDate)
    }
  }
  const update: RuleReconcile['update'] = []
  const remove: string[] = []
  for (const e of mine) {
    const nd = fresh.get(e.id)
    if (nd) {
      if (nd !== e.dueDate && !e.note) update.push({ id: e.id, dueDate: nd })
    } else if (isUntouched(e, next)) {
      remove.push(e.id)
    }
  }
  return { update, remove }
}

/** ¿Cambió algo que afecte las fechas generadas? */
export function ruleChanged(a: Activity, b: Activity) {
  const keys: (keyof Activity)[] = ['frequency', 'interval', 'startDate', 'endDate', 'businessDaysOnly', 'branch', 'splitBranches', 'eventType', 'offsetDays']
  return keys.some(k => (a[k] ?? '') !== (b[k] ?? ''))
}

// ---- Filtros y resúmenes ----

export type ExecFilter = {
  person?: Role | 'TODOS'
  branch?: BranchScope | 'TODAS'
  frequency?: Frequency | 'TODAS'
  visual?: Visual | 'previstas' | 'pendientes'
  query?: string
}

export function matchesFilter(e: Execution, f: ExecFilter, activity: Activity | undefined, today: ISODate) {
  if (f.person && f.person !== 'TODOS' && e.executor !== f.person) return false
  if (f.branch && f.branch !== 'TODAS' && e.branch !== f.branch && e.branch !== 'AMBAS') return false
  if (f.frequency && f.frequency !== 'TODAS' && activity?.frequency !== f.frequency) return false
  if (f.visual && f.visual !== 'previstas') {
    const v = visualState(e, today, leadDaysFor(activity))
    if (f.visual === 'pendientes') {
      if (!(v === 'pending' || v === 'soon' || v === 'progress')) return false
    } else if (f.visual === 'pending') {
      if (!(v === 'pending' || v === 'soon')) return false
    } else if (v !== f.visual) return false
  }
  if (f.query) {
    const q = f.query.toLowerCase()
    const hay = `${activity?.name || e.activityName || ''} ${activity?.description || ''} ${e.note || ''}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export type Summary = {
  previstas: number
  realizadas: number
  pendientes: number
  vencidas: number
  noRealizadas: number
}

/** Siempre calculado desde las ejecuciones reales (guardadas o generadas por regla). */
export function summarize(list: Execution[], today: ISODate): Summary {
  const s: Summary = { previstas: 0, realizadas: 0, pendientes: 0, vencidas: 0, noRealizadas: 0 }
  for (const e of list) {
    s.previstas++
    if (e.status === 'REALIZADA') s.realizadas++
    else if (e.status === 'NO_REALIZADA') s.noRealizadas++
    else if (e.dueDate < today) s.vencidas++
    else s.pendientes++
  }
  return s
}

/** Cambios para completar una ejecución: guarda fecha y ejecutor automáticamente. */
export function completionPatch(user: Role | undefined, nowIso = new Date().toISOString()): Partial<Execution> {
  return {
    status: 'REALIZADA',
    completedAt: nowIso,
    ...(user ? { completedBy: user, executor: user } : {})
  }
}

export function statusPatch(status: ExecStatus, user: Role | undefined, nowIso = new Date().toISOString()): Partial<Execution> {
  if (status === 'REALIZADA') return completionPatch(user, nowIso)
  if (status === 'NO_REALIZADA') return { status, completedAt: nowIso, ...(user ? { completedBy: user } : {}) }
  return { status, completedAt: '', completedBy: undefined }
}

