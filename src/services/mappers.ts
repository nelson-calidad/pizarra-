// Conversión entre objetos de la app y filas de Google Sheets.
import type { Activity, Execution, Note, PlannerEvent, ChecklistItem, Person, ActivityEntry } from '../types'

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const optStr = (v: unknown) => {
  const s = str(v).trim()
  return s ? s : undefined
}
const bool = (v: unknown, def = false) => {
  if (v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'FALSE' || v === 'false' || v === 0 || v === '0') return false
  return def
}
const num = (v: unknown, def?: number) => {
  if (v === '' || v === null || v === undefined) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/** Acepta 'YYYY-MM-DD', ISO completo o valores Date serializados. */
export const normalizeDate = (d?: unknown): string | undefined => {
  if (!d || typeof d !== 'string') return undefined
  const t = d.trim()
  if (!t) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    // Fecha serializada por Sheets (medianoche local convertida a UTC): usar la fecha local.
    const dt = new Date(t)
    if (!isNaN(dt.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
    }
    return t.slice(0, 10)
  }
  return t
}

const mapKeys = (map: Record<string, string>, obj: Record<string, unknown>) => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'virtual') continue
    const col = map[k] || k.toUpperCase()
    out[col] = v === undefined || v === null ? '' : v
  }
  return out
}

// ---------------- NOTAS (sin cambios de estructura) ----------------

const NOTE_MAP: Record<string, string> = {
  id: 'ID', text: 'TEXTO', description: 'DESCRIPCION',
  status: 'ESTADO', date: 'FECHA', time: 'HORA',
  category: 'CATEGORIA', priority: 'PRIORIDAD',
  assignee: 'RESPONSABLE', color: 'COLOR', pinned: 'FIJADA',
  x: 'X', y: 'Y', width: 'ANCHO', height: 'ALTO',
  createdAt: 'CREADO_EN', updatedAt: 'ACTUALIZADO_EN',
  completedAt: 'COMPLETADO_EN', checklistCount: 'CHECKLIST_TOTAL', checklistDone: 'CHECKLIST_HECHOS'
}

export const toSheet = (n: Partial<Note>) => {
  const { checklistCount: _a, checklistDone: _b, ...rest } = n
  return mapKeys(NOTE_MAP, rest as Record<string, unknown>)
}

export const fromSheet = (n: Record<string, unknown>): Note => ({
  id: str(n.ID),
  text: str(n.TEXTO),
  description: str(n.DESCRIPCION),
  status: (str(n.ESTADO) || 'PENDIENTE') as Note['status'],
  date: normalizeDate(n.FECHA),
  time: optStr(n.HORA),
  category: str(n.CATEGORIA) || 'General',
  priority: str(n.PRIORIDAD) || 'NORMAL',
  assignee: optStr(n.RESPONSABLE),
  color: str(n.COLOR) || 'yellow',
  pinned: bool(n.FIJADA),
  x: Math.max(0, Number(n.X) || 120),
  y: Math.max(0, Number(n.Y) || 120),
  width: Number(n.ANCHO) || 264,
  height: Number(n.ALTO) || 155,
  createdAt: str(n.CREADO_EN) || new Date().toISOString(),
  updatedAt: optStr(n.ACTUALIZADO_EN),
  completedAt: optStr(n.COMPLETADO_EN)
})

export const fromSheetPerson = (n: Record<string, unknown>): Person => ({
  id: str(n.ID),
  name: str(n.NOMBRE),
  active: n.ACTIVO === undefined || n.ACTIVO === '' ? true : bool(n.ACTIVO, true),
  order: Number(n.ORDEN) || 0,
  createdAt: str(n.CREADO_EN) || new Date().toISOString()
})

export const fromSheetActivity = (n: Record<string, unknown>): ActivityEntry => ({
  id: str(n.ID),
  noteId: str(n.NOTA_ID),
  action: str(n.ACCION),
  detail: str(n.DETALLE),
  before: optStr(n.ANTES),
  after: optStr(n.DESPUES),
  actor: optStr(n.ACTOR),
  createdAt: str(n.CREADO_EN) || new Date().toISOString()
})

export const fromSheetChecklist = (n: Record<string, unknown>): ChecklistItem => ({
  id: str(n.ID),
  noteId: str(n.NOTA_ID),
  text: str(n.TEXTO),
  done: bool(n.COMPLETADO),
  order: Number(n.ORDEN) || 0
})

// ---------------- ACTIVIDADES ----------------

const ACTIVITY_MAP: Record<string, string> = {
  id: 'ID', name: 'NOMBRE', description: 'DESCRIPCION', frequency: 'FRECUENCIA', interval: 'INTERVALO',
  startDate: 'FECHA_INICIO', endDate: 'FECHA_FIN', effectiveFrom: 'VIGENTE_DESDE', businessDaysOnly: 'SOLO_HABILES',
  branch: 'SUCURSAL', splitBranches: 'POR_SUCURSAL', responsible: 'RESPONSABLE', category: 'CATEGORIA',
  eventType: 'TIPO_EVENTO', offsetDays: 'DESPLAZAMIENTO_DIAS', leadDays: 'AVISO_DIAS', state: 'ESTADO',
  sourceNoteId: 'NOTA_ORIGEN_ID', createdBy: 'CREADO_POR', createdAt: 'CREADO_EN', updatedAt: 'ACTUALIZADO_EN'
}

export const activityToSheet = (a: Partial<Activity>) => mapKeys(ACTIVITY_MAP, a as Record<string, unknown>)

export const activityFromSheet = (r: Record<string, unknown>): Activity => ({
  id: str(r.ID),
  name: str(r.NOMBRE),
  description: optStr(r.DESCRIPCION),
  frequency: (str(r.FRECUENCIA) || 'UNICA') as Activity['frequency'],
  interval: num(r.INTERVALO, 1) || 1,
  startDate: normalizeDate(str(r.FECHA_INICIO)) || '',
  endDate: normalizeDate(str(r.FECHA_FIN)),
  effectiveFrom: normalizeDate(str(r.VIGENTE_DESDE)),
  businessDaysOnly: bool(r.SOLO_HABILES),
  branch: (str(r.SUCURSAL) || 'AMBAS') as Activity['branch'],
  splitBranches: bool(r.POR_SUCURSAL, true),
  responsible: (str(r.RESPONSABLE) || 'ANALISTA') as Activity['responsible'],
  category: optStr(r.CATEGORIA),
  eventType: optStr(r.TIPO_EVENTO),
  offsetDays: num(r.DESPLAZAMIENTO_DIAS),
  leadDays: num(r.AVISO_DIAS),
  state: (str(r.ESTADO) || 'ACTIVA') as Activity['state'],
  sourceNoteId: optStr(r.NOTA_ORIGEN_ID),
  createdBy: optStr(r.CREADO_POR),
  createdAt: str(r.CREADO_EN) || new Date().toISOString(),
  updatedAt: optStr(r.ACTUALIZADO_EN)
})

// ---------------- EJECUCIONES ----------------

const EXEC_MAP: Record<string, string> = {
  id: 'ID', activityId: 'ACTIVIDAD_ID', period: 'PERIODO', branch: 'SUCURSAL', dueDate: 'FECHA',
  executor: 'EJECUTOR', status: 'ESTADO', note: 'OBSERVACION', evidence: 'EVIDENCIA', reason: 'MOTIVO',
  completedAt: 'COMPLETADO_EN', completedBy: 'COMPLETADO_POR', eventId: 'EVENTO_ID',
  activityName: 'NOMBRE_ACTIVIDAD', createdAt: 'CREADO_EN', updatedAt: 'ACTUALIZADO_EN'
}

export const executionToSheet = (e: Partial<Execution>) => mapKeys(EXEC_MAP, e as Record<string, unknown>)

export const executionFromSheet = (r: Record<string, unknown>): Execution => ({
  id: str(r.ID),
  activityId: str(r.ACTIVIDAD_ID),
  period: str(r.PERIODO),
  branch: (str(r.SUCURSAL) || 'AMBAS') as Execution['branch'],
  dueDate: normalizeDate(str(r.FECHA)) || '',
  executor: (str(r.EJECUTOR) || 'ANALISTA') as Execution['executor'],
  status: (str(r.ESTADO) || 'PENDIENTE') as Execution['status'],
  note: optStr(r.OBSERVACION),
  evidence: optStr(r.EVIDENCIA),
  reason: optStr(r.MOTIVO),
  completedAt: optStr(r.COMPLETADO_EN),
  completedBy: optStr(r.COMPLETADO_POR) as Execution['completedBy'],
  eventId: optStr(r.EVENTO_ID),
  activityName: optStr(r.NOMBRE_ACTIVIDAD),
  createdAt: str(r.CREADO_EN) || new Date().toISOString(),
  updatedAt: optStr(r.ACTUALIZADO_EN)
})

// ---------------- EVENTOS ----------------

const EVENT_MAP: Record<string, string> = {
  id: 'ID', type: 'TIPO', title: 'TITULO', date: 'FECHA', branch: 'SUCURSAL', state: 'ESTADO',
  notes: 'NOTAS', createdBy: 'CREADO_POR', createdAt: 'CREADO_EN', updatedAt: 'ACTUALIZADO_EN'
}

export const eventToSheet = (e: Partial<PlannerEvent>) => mapKeys(EVENT_MAP, e as Record<string, unknown>)

export const eventFromSheet = (r: Record<string, unknown>): PlannerEvent => ({
  id: str(r.ID),
  type: str(r.TIPO) || 'OTRO',
  title: optStr(r.TITULO),
  date: normalizeDate(str(r.FECHA)) || '',
  branch: (str(r.SUCURSAL) || 'AMBAS') as PlannerEvent['branch'],
  state: (str(r.ESTADO) || 'ACTIVO') as PlannerEvent['state'],
  notes: optStr(r.NOTAS),
  createdBy: optStr(r.CREADO_POR),
  createdAt: str(r.CREADO_EN) || new Date().toISOString(),
  updatedAt: optStr(r.ACTUALIZADO_EN)
})

