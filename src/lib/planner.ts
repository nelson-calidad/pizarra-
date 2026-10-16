// Lógica de planificación: combina actividades, ejecuciones guardadas y eventos.
// Sin dependencias de React: se prueba de forma aislada.

import type {
  Activity, Execution, ExecStatus, PlannerEvent, Role, BranchScope, Frequency,
  IndividualConfirmation
} from '../types'
import { addDays, diffDays, startOfWeek, isWeekend, type ISODate } from './dates'
import { computeWindowStart, occurrences, virtualExecution } from './recurrence'

export type Visual = 'done' | 'notdone' | 'overdue' | 'soon' | 'progress' | 'pending'

export const DEFAULT_LEAD: Record<Frequency, number> = {
  UNICA: 2,
  DIARIA: 0,
  SEMANAL: 2,
  MENSUAL: 3,
  TRIMESTRAL: 7,
  SEMESTRAL: 7,
  ANUAL: 14,
  EVENTO: 3
}

export const isResolved = (s: ExecStatus) => s === 'REALIZADA' || s === 'NO_REALIZADA'

export function leadDaysFor(a?: Pick<Activity, 'frequency' | 'leadDays' | 'flexible'>) {
  if (!a) return 2
  const n = Number(a.leadDays)
  if (Number.isFinite(n) && a.leadDays !== undefined && a.leadDays !== null) {
    return Math.max(0, n)
  }
  if (a.frequency === 'SEMANAL' && !a.flexible) return 0
  return DEFAULT_LEAD[a.frequency]
}

/** ¿Está hoy dentro de la ventana activa de una actividad con ventana (ej. del 7 al 10)? */
export function isInActiveWindow(e: Pick<Execution, 'windowStart' | 'dueDate'>, today: ISODate, a?: Pick<Activity, 'flexible' | 'windowStartDay' | 'windowEndDay'>): boolean {
  if (!e.windowStart) return false
  // Las semanales flexibles usan windowStart=lunes para aparecer en Semana, no como ventana fija en Hoy
  if (a?.flexible) return false
  return e.windowStart <= today && today <= e.dueDate
}

/** Estado visual calculado desde la fecha real de la ejecución. */
export function visualState(
  e: Pick<Execution, 'status' | 'dueDate' | 'windowStart'>,
  today: ISODate,
  lead = 2,
  a?: Pick<Activity, 'flexible' | 'windowStartDay' | 'windowEndDay'>
): Visual {
  if (e.status === 'REALIZADA') return 'done'
  if (e.status === 'NO_REALIZADA') return 'notdone'
  if (e.dueDate < today) return 'overdue'
  if (e.status === 'EN_CURSO') return 'progress'
  if (isInActiveWindow(e, today, a)) return 'soon'
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
  const actById = new Map(activities.map(a => [a.id, a]))
  for (const e of persisted) {
    const act = actById.get(e.activityId)
    if (!act) continue
    const winStart = e.windowStart || computeWindowStart(act, e.dueDate)
    const overlapsWindow = winStart !== undefined && winStart <= to && e.dueDate >= from
    if ((e.dueDate >= from && e.dueDate <= to) || overlapsWindow) {
      const mode = e.completionMode || act.completionMode || 'CUALQUIERA'
      const label = e.completionLabel || act.completionLabel
      byId.set(e.id, {
        ...e,
        windowStart: winStart || e.windowStart,
        completionMode: mode,
        completionLabel: label
      })
    }
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
  return (
    a.dueDate.localeCompare(b.dueDate) ||
    (a.activityName || '').localeCompare(b.activityName || '') ||
    a.branch.localeCompare(b.branch)
  )
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
  lookbackDays = 60,
  nowIso = new Date().toISOString()
): Execution[] {
  const ids = new Set(persisted.map(e => e.id))
  const from = addDays(today, -lookbackDays)
  const out: Execution[] = []
  for (const a of activities) {
    if (a.state !== 'ACTIVA') continue
    // Para diarias solo materializamos desde los últimos 14 días para evitar acumulaciones masivas
    const actFrom = a.frequency === 'DIARIA' ? addDays(today, -14) : from
    for (const o of occurrences(a, actFrom, today, events)) {
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
    !e.note &&
    !e.evidence &&
    !e.reason &&
    !e.completedAt &&
    (!a || e.executor === a.responsible)
  )
}

export type RuleReconcile = { update: { id: string; dueDate: string }[]; remove: string[] }

/**
 * Tras cambiar la regla de una actividad: ajusta ejecuciones futuras pendientes.
 * El historial (fechas pasadas o ejecuciones con datos) nunca se toca.
 */
export function reconcileAfterRuleChange(
  next: Activity,
  persisted: Execution[],
  events: PlannerEvent[],
  today: ISODate
): RuleReconcile {
  const mine = persisted.filter(
    e => e.activityId === next.id && e.dueDate >= today && e.status === 'PENDIENTE'
  )
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
  const keys: (keyof Activity)[] = [
    'frequency',
    'interval',
    'startDate',
    'endDate',
    'businessDaysOnly',
    'flexible',
    'windowStartDay',
    'windowEndDay',
    'branch',
    'splitBranches',
    'eventType',
    'offsetDays'
  ]
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

export function matchesFilter(
  e: Execution,
  f: ExecFilter,
  activity: Activity | undefined,
  today: ISODate
) {
  if (f.person && f.person !== 'TODOS' && e.executor !== f.person) return false
  if (f.branch && f.branch !== 'TODAS' && e.branch !== f.branch && e.branch !== 'AMBAS') return false
  if (f.frequency && f.frequency !== 'TODAS' && activity?.frequency !== f.frequency) return false
  if (f.visual && f.visual !== 'previstas') {
    const v = visualState(e, today, leadDaysFor(activity), activity)
    if (f.visual === 'pendientes') {
      if (!(v === 'pending' || v === 'soon' || v === 'progress')) return false
    } else if (f.visual === 'pending') {
      if (!(v === 'pending' || v === 'soon')) return false
    } else if (v !== f.visual) return false
  }
  if (f.query) {
    const q = f.query.toLowerCase()
    const hay = `${activity?.name || e.activityName || ''} ${activity?.description || ''} ${
      e.note || ''
    }`.toLowerCase()
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
export function completionPatch(
  user: Role | undefined,
  nowIso = new Date().toISOString()
): Partial<Execution> {
  return {
    status: 'REALIZADA',
    completedAt: nowIso,
    ...(user ? { completedBy: user, executor: user } : {})
  }
}

export function statusPatch(
  status: ExecStatus,
  user: Role | undefined,
  nowIso = new Date().toISOString()
): Partial<Execution> {
  if (status === 'REALIZADA') return completionPatch(user, nowIso)
  if (status === 'NO_REALIZADA') {
    return { status, completedAt: nowIso, ...(user ? { completedBy: user } : {}) }
  }
  return { status, completedAt: '', completedBy: undefined }
}

// ============================================================
// VISTAS DE AGENDA: HOY y SEMANA
// ============================================================

export type DailyBacklogGroup = {
  activityId: string
  activityName: string
  branch: BranchScope
  items: Execution[]
}

export type TodayViewModel = {
  /** Tareas que corresponden realizar hoy (diarias de hoy, semanales de hoy, o dentro de su ventana activa). */
  todayTasks: Execution[]
  /** Vencidas no diarias (o diarias únicas) que siguen pendientes. */
  overdueTasks: Execution[]
  /** Acumulaciones de actividades diarias vencidas agrupadas de forma compacta. */
  dailyBacklog: DailyBacklogGroup[]
  /** Actividades flexibles próximas a vencer (apartado secundario). */
  flexibleSoon: Execution[]
  /** Actividades ya completadas de hoy / ventana actual (mostradas compactas). */
  completedToday: Execution[]
}

/**
 * Construye el modelo exacto para la vista HOY:
 * - Diarias de hoy, semanales fijas de hoy, eventos de hoy y mensuales/otras cuya fecha es hoy o están dentro de su ventana activa (ej. del 7 al 10).
 * - Las semanales flexibles no saturan Hoy al inicio de la semana: aparecen en `flexibleSoon` cuando se acerca su vencimiento (o en `todayTasks` el día que vencen).
 * - Al completarse una tarea en ventana (ej. el día 7 de una ventana 7–10), desaparece de las pendientes y pasa a `completedToday`.
 * - Evita acumulaciones interminables de diarias vencidas agrupándolas en `dailyBacklog`.
 */
export function buildTodayView(
  activities: Activity[],
  persisted: Execution[],
  events: PlannerEvent[],
  today: ISODate,
  filter: ExecFilter = {}
): TodayViewModel {
  const actMap = new Map(activities.map(a => [a.id, a]))
  const from = addDays(today, -60)
  const to = addDays(today, 21)
  const all = buildExecutions(activities, persisted, events, from, to).filter(e =>
    matchesFilter(e, filter, actMap.get(e.activityId), today)
  )

  const todayTasks: Execution[] = []
  const overdueRegular: Execution[] = []
  const overdueDailiesByKey = new Map<string, Execution[]>()
  const flexibleSoon: Execution[] = []
  const completedToday: Execution[] = []

  for (const e of all) {
    const act = actMap.get(e.activityId)
    const inWin = isInActiveWindow(e, today, act)
    const isTodayDue = e.dueDate === today

    if (isResolved(e.status)) {
      const completedDate = e.completedAt ? e.completedAt.slice(0, 10) : ''
      if (isTodayDue || inWin || completedDate === today) {
        completedToday.push(e)
      }
      continue
    }

    // Pendiente o En curso
    if (e.dueDate < today) {
      if (act?.frequency === 'DIARIA') {
        const key = `${e.activityId}__${e.branch}`
        const arr = overdueDailiesByKey.get(key) || []
        arr.push(e)
        overdueDailiesByKey.set(key, arr)
      } else {
        overdueRegular.push(e)
      }
      continue
    }

    if (isTodayDue || inWin) {
      todayTasks.push(e)
      continue
    }

    // Futuras (> today): evaluar si son flexibles próximas a vencer
    const lead = leadDaysFor(act)
    const daysLeft = diffDays(e.dueDate, today)
    if (lead > 0 && daysLeft > 0 && daysLeft <= lead) {
      flexibleSoon.push(e)
    }
  }

  // Si una diaria tiene 1 sola vencida (ej. ayer), se muestra normal; si tiene >= 2 se compacta en dailyBacklog
  const dailyBacklog: DailyBacklogGroup[] = []
  for (const [, list] of overdueDailiesByKey.entries()) {
    if (list.length === 1) {
      overdueRegular.push(list[0])
    } else if (list.length > 1) {
      const first = list[0]
      const act = actMap.get(first.activityId)
      dailyBacklog.push({
        activityId: first.activityId,
        activityName: act?.name || first.activityName || 'Actividad diaria',
        branch: first.branch,
        items: list.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      })
    }
  }

  return {
    todayTasks,
    overdueTasks: overdueRegular,
    dailyBacklog,
    flexibleSoon,
    completedToday
  }
}

export type WeekDayColumn = {
  date: ISODate
  isBusinessDay: boolean
  isToday: boolean
  items: Execution[]
}

export type WeekViewModel = {
  weekStart: ISODate
  weekEnd: ISODate
  days: WeekDayColumn[]
  /** Apartado discreto "Flexibles de la semana" (retrocompatibilidad) */
  flexibleWeek: Execution[]
  /** Semanales flexibles */
  flexibleWeekly: Execution[]
  /** Mensuales con ventana abierta durante la semana */
  monthWindows: Execution[]
  /** Tareas vencidas no resueltas de la semana */
  overdueWeek: Execution[]
}

export function buildWeekView(
  activities: Activity[],
  persisted: Execution[],
  events: PlannerEvent[],
  referenceDate: ISODate,
  today: ISODate,
  filter: ExecFilter = {}
): WeekViewModel {
  const weekStart = startOfWeek(referenceDate)
  const weekEnd = addDays(weekStart, 6)
  const actMap = new Map(activities.map(a => [a.id, a]))

  const all = buildExecutions(activities, persisted, events, weekStart, weekEnd).filter(e =>
    matchesFilter(e, filter, actMap.get(e.activityId), today)
  )

  const flexibleWeek: Execution[] = []
  const flexibleWeekly: Execution[] = []
  const monthWindows: Execution[] = []
  const overdueWeek: Execution[] = []
  const byDay = new Map<ISODate, Execution[]>()
  for (let i = 0; i < 7; i++) {
    byDay.set(addDays(weekStart, i), [])
  }

  for (const e of all) {
    const act = actMap.get(e.activityId)
    const isFlexibleWeekly = act?.frequency === 'SEMANAL' && Boolean(act.flexible)
    const hasMonthWindow = Boolean(
      act?.windowStartDay && act?.windowEndDay && act.windowEndDay > act.windowStartDay
    )

    if (e.dueDate < today && e.status !== 'REALIZADA' && e.status !== 'NO_REALIZADA') {
      overdueWeek.push(e)
    }

    if (isFlexibleWeekly) {
      flexibleWeekly.push(e)
      flexibleWeek.push(e)
    } else if (hasMonthWindow) {
      monthWindows.push(e)
      flexibleWeek.push(e)
    } else if (byDay.has(e.dueDate)) {
      byDay.get(e.dueDate)!.push(e)
    }
  }

  const days: WeekDayColumn[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    days.push({
      date: d,
      isBusinessDay: !isWeekend(d),
      isToday: d === today,
      items: byDay.get(d) || []
    })
  }

  return {
    weekStart,
    weekEnd,
    days,
    flexibleWeek,
    flexibleWeekly,
    monthWindows,
    overdueWeek
  }
}

// ============================================================
// AGRUPACIÓN VISUAL Y MODALIDADES DE CUMPLIMIENTO
// ============================================================

export type GroupedExecutionCard = {
  key: string
  activityId: string
  activityName: string
  activity?: Activity
  period: string
  dueDate: string
  items: Execution[]
}

/**
 * Agrupa ejecuciones de la misma actividad y período para mostrarlas compactas por sucursal.
 */
export function groupExecutionsByActivity(
  executions: Execution[],
  activities: Activity[] | Map<string, Activity>
): GroupedExecutionCard[] {
  const actMap = activities instanceof Map ? activities : new Map(activities.map(a => [a.id, a]))
  const groups = new Map<string, GroupedExecutionCard>()

  for (const ex of executions) {
    const key = `${ex.activityId}__${ex.dueDate || ex.period}`
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(ex)
    } else {
      const act = actMap.get(ex.activityId)
      groups.set(key, {
        key,
        activityId: ex.activityId,
        activityName: act?.name || ex.activityName || 'Actividad',
        activity: act,
        period: ex.period,
        dueDate: ex.dueDate,
        items: [ex]
      })
    }
  }

  return Array.from(groups.values())
}

/**
 * Modalidad A: Cualquiera de los dos (predeterminada).
 * Un solo clic marca la ejecución como REALIZADA para ambos usuarios.
 */
export function toggleAnyCompletion(
  ex: Execution,
  actor: Role,
  nowIso = new Date().toISOString()
): Partial<Execution> {
  if (ex.status === 'REALIZADA') {
    return {
      status: 'PENDIENTE',
      completedAt: undefined,
      completedBy: undefined
    }
  }
  return {
    status: 'REALIZADA',
    completedAt: nowIso,
    completedBy: actor,
    executor: actor
  }
}

/**
 * Modalidad B: Trabajo conjunto.
 * Registra quiénes participaron realmente (RAC + Analista o actor).
 */
export function toggleJointCompletion(
  ex: Execution,
  actor: Role,
  participants: Role[] = ['RAC', 'ANALISTA'],
  nowIso = new Date().toISOString()
): Partial<Execution> {
  if (ex.status === 'REALIZADA') {
    return {
      status: 'PENDIENTE',
      completedAt: undefined,
      completedBy: undefined,
      participants: undefined
    }
  }
  return {
    status: 'REALIZADA',
    completedAt: nowIso,
    completedBy: actor,
    executor: actor,
    participants
  }
}

/**
 * Modalidad C: Revisión individual de ambos (confirmación doble).
 * Cada operador tiene su propia confirmación; la actividad queda REALIZADA cuando ambos cumplieron.
 */
export function toggleIndividualConfirmation(
  ex: Execution,
  role: Role,
  nowIso = new Date().toISOString()
): Partial<Execution> {
  const currentConfs = ex.confirmations || {
    RAC: { status: 'PENDIENTE' },
    ANALISTA: { status: 'PENDIENTE' }
  }
  const roleConf = currentConfs[role] || { status: 'PENDIENTE' }
  const isDone = roleConf.status === 'REALIZADA'

  const nextRoleConf: IndividualConfirmation = isDone
    ? { status: 'PENDIENTE' }
    : { status: 'REALIZADA', completedAt: nowIso, completedBy: role }

  const nextConfs = {
    ...currentConfs,
    [role]: nextRoleConf
  }

  const racDone = nextConfs.RAC?.status === 'REALIZADA'
  const analistaDone = nextConfs.ANALISTA?.status === 'REALIZADA'

  let overallStatus: ExecStatus = 'PENDIENTE'
  let completedAt: string | undefined = undefined
  let completedBy: Role | undefined = undefined

  if (racDone && analistaDone) {
    overallStatus = 'REALIZADA'
    completedAt = nowIso
    completedBy = role
  } else if (racDone || analistaDone) {
    overallStatus = 'EN_CURSO'
  }

  return {
    confirmations: nextConfs,
    status: overallStatus,
    completedAt,
    completedBy
  }
}

/**
 * Deduplica actividades maestras por ID, por importId y por nombre normalizado.
 */
export function deduplicateActivities(list: Activity[]): Activity[] {
  const seenIds = new Set<string>()
  const seenCodes = new Set<string>()
  const seenNames = new Set<string>()
  const result: Activity[] = []

  for (const act of list) {
    if (!act || !act.id) continue
    const normName = act.name.trim().toLowerCase()
    const code = (act.importId || '').trim().toUpperCase()

    if (seenIds.has(act.id)) continue
    if (code && seenCodes.has(code)) continue
    if (normName && seenNames.has(normName)) continue

    seenIds.add(act.id)
    if (code) seenCodes.add(code)
    if (normName) seenNames.add(normName)
    result.push(act)
  }
  return result
}
