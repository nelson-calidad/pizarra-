import type { Activity, BranchScope, ExecStatus, Frequency, Role } from '../types'
import { parseISO, weekdayNameByIndex, weekday, isValidISO, shortDate } from './dates'
import type { Visual } from './planner'

export const ROLES: Role[] = ['RAC', 'ANALISTA']
export const ROLE_LABEL: Record<Role, string> = { RAC: 'RAC', ANALISTA: 'Analista' }
export const ROLE_LONG: Record<Role, string> = {
  RAC: 'Responsable de Calidad',
  ANALISTA: 'Analista de Calidad'
}

export const BRANCH_LABEL: Record<BranchScope, string> = {
  JUJUY: 'Jujuy',
  SALTA: 'Salta',
  AMBAS: 'Jujuy y Salta'
}
export const BRANCH_SHORT: Record<BranchScope, string> = {
  JUJUY: 'JUJ',
  SALTA: 'SAL',
  AMBAS: 'J+S'
}

export const FREQ_LABEL: Record<Frequency, string> = {
  UNICA: 'Única',
  DIARIA: 'Diaria',
  SEMANAL: 'Semanal',
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  EVENTO: 'Por evento'
}
export const RECURRING: Frequency[] = [
  'DIARIA',
  'SEMANAL',
  'MENSUAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL'
]

export const STATUS_LABEL: Record<ExecStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  REALIZADA: 'Realizada',
  NO_REALIZADA: 'No realizada'
}

export const VISUAL_LABEL: Record<Visual, string> = {
  pending: 'Pendiente',
  soon: 'Próxima',
  progress: 'En curso',
  overdue: 'Vencida',
  done: 'Realizada',
  notdone: 'No realizada'
}

export const EVENT_TYPES: { key: string; label: string }[] = [
  { key: 'PCGC', label: 'Auditoría PCGC' },
  { key: 'RESULTADOS_PCGC', label: 'Recepción resultados PCGC' },
  { key: 'AUDITORIA_ISO', label: 'Auditoría ISO 9001' },
  { key: 'RESULTADOS_ISO', label: 'Recepción resultados ISO' },
  { key: 'AVANCE_SSI', label: 'Avance intermedio SSI Ventas' },
  { key: 'CIERRE_SSI', label: 'Cierre de ola SSI Ventas' },
  { key: 'AVANCE_CSI', label: 'Avance intermedio CSI Posventa' },
  { key: 'CIERRE_CSI', label: 'Cierre de ola CSI Posventa' },
  { key: 'CIERRE_INDICADORES', label: 'Cierre oficial de indicadores' },
  { key: 'TEST_TALLER', label: 'Test de taller' },
  { key: 'VISITA_SALTA', label: 'Visita a Salta' },
  { key: 'INDUCCION_CALIDAD', label: 'Inducción de Calidad' },
  { key: 'AUDITORIA_INTERNA', label: 'Auditoría / control interno' },
  { key: 'OTRO', label: 'Otro evento' }
]
export const eventTypeLabel = (k?: string) => EVENT_TYPES.find(e => e.key === k)?.label || k || 'Evento'

export const CATEGORIES = [
  'Indicadores',
  'Auditorías',
  'Controles',
  'Ambiente y Procesos',
  'Comunicaciones',
  'General'
]

const UNIT: Record<string, [string, string]> = {
  DIARIA: ['día', 'días'],
  SEMANAL: ['semana', 'semanas'],
  MENSUAL: ['mes', 'meses'],
  TRIMESTRAL: ['trimestre', 'trimestres'],
  SEMESTRAL: ['semestre', 'semestres'],
  ANUAL: ['año', 'años']
}

/** Descripción legible de la regla: "Mensual · del 7 al 10", "Semanal flexible · vence viernes", etc. */
export function describeRule(
  a: Pick<
    Activity,
    | 'frequency'
    | 'interval'
    | 'startDate'
    | 'businessDaysOnly'
    | 'flexible'
    | 'windowStartDay'
    | 'windowEndDay'
    | 'eventType'
    | 'offsetDays'
  >
): string {
  const n = Math.max(1, Number(a.interval) || 1)
  const every = (f: Frequency) => (n > 1 ? `Cada ${n} ${UNIT[f][1]}` : FREQ_LABEL[f])
  const valid = isValidISO(a.startDate)
  switch (a.frequency) {
    case 'UNICA':
      return valid ? `Única · ${shortDate(a.startDate)}` : 'Única'
    case 'DIARIA':
      return `${every('DIARIA')}${a.businessDaysOnly ? ' · lun a vie' : ''}`
    case 'SEMANAL': {
      if (!valid) return every('SEMANAL')
      const dayName = weekdayNameByIndex(weekday(a.startDate))
      return a.flexible
        ? `${every('SEMANAL')} flexible · vence ${dayName}`
        : `${every('SEMANAL')} · ${dayName}`
    }
    case 'MENSUAL':
    case 'TRIMESTRAL':
    case 'SEMESTRAL':
    case 'ANUAL': {
      if (a.windowStartDay && a.windowEndDay && a.windowEndDay >= a.windowStartDay) {
        return `${every(a.frequency)} · del ${a.windowStartDay} al ${a.windowEndDay}`
      }
      if (!valid) return every(a.frequency)
      const { d } = parseISO(a.startDate)
      const day = d >= 29 ? `día ${d} (o último)` : `día ${d}`
      return a.frequency === 'ANUAL'
        ? `${every('ANUAL')} · ${shortDate(a.startDate)}`
        : `${every(a.frequency)} · ${day}`
    }
    case 'EVENTO': {
      const off = Math.round(Number(a.offsetDays) || 0)
      const rel =
        off === 0 ? 'el mismo día' : off < 0 ? `${-off} días antes` : `${off} días después`
      return `${eventTypeLabel(a.eventType)} · ${rel}`
    }
  }
}

/** Etiqueta corta del período de una ejecución. */
export function periodLabel(period: string, freq?: Frequency): string {
  if (period === 'U') return 'Única'
  if (period.startsWith('E-')) return 'Evento'
  if (/^\d{4}-W\d{2}$/.test(period)) return `Semana ${Number(period.slice(6))}`
  if (/^\d{4}-Q\d$/.test(period)) return `${period.slice(6)}° trimestre ${period.slice(0, 4)}`
  if (/^\d{4}-S\d$/.test(period)) return `${period.slice(6)}° semestre ${period.slice(0, 4)}`
  if (/^\d{4}$/.test(period)) return `Año ${period}`
  if (/^\d{4}-\d{2}$/.test(period)) return period
  if (freq === 'DIARIA') return shortDate(period)
  return period
}
