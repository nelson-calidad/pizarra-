import { describe, expect, it } from 'vitest'
import type { Activity, Execution, PlannerEvent } from '../../types'
import { addMonthsClamped, isoWeekKey, isLeapYear, isValidISO, addDays } from '../dates'
import { occurrences, ruleDates, executionId, periodKey } from '../recurrence'
import {
  buildExecutions, pendingMaterialization, reconcileAfterRuleChange, summarize, visualState,
  matchesFilter, completionPatch, ruleChanged
} from '../planner'
import { describeRule } from '../labels'

const base = (p: Partial<Activity>): Activity => ({
  id: 'A1',
  name: 'Control de órdenes',
  frequency: 'MENSUAL',
  interval: 1,
  startDate: '2026-01-15',
  businessDaysOnly: false,
  branch: 'JUJUY',
  splitBranches: true,
  responsible: 'ANALISTA',
  state: 'ACTIVA',
  createdAt: '2026-01-01T00:00:00Z',
  ...p
})

describe('fechas', () => {
  it('años bisiestos', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
  })
  it('rechaza fechas inexistentes', () => {
    expect(isValidISO('2026-02-29')).toBe(false)
    expect(isValidISO('2028-02-29')).toBe(true)
    expect(isValidISO('2026-04-31')).toBe(false)
    expect(isValidISO('2026-13-01')).toBe(false)
    expect(isValidISO('')).toBe(false)
  })
  it('suma meses ajustando a fin de mes', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-01-31', 2, 31)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28')
  })
  it('cruce de año en días', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('semana ISO en cambio de año', () => {
    expect(isoWeekKey('2026-12-31')).toBe('2026-W53')
    expect(isoWeekKey('2027-01-04')).toBe('2027-W01')
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01')
  })
})

describe('recurrencias', () => {
  it('mensual el día 31 se ajusta al último día y no se acumula el desvío', () => {
    const a = base({ startDate: '2026-01-31' })
    expect(ruleDates(a, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'
    ])
  })
  it('mensual con 29/02 en año bisiesto', () => {
    const a = base({ startDate: '2028-01-29' })
    expect(ruleDates(a, '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-29'])
    const b = base({ startDate: '2027-01-29' })
    expect(ruleDates(b, '2027-02-01', '2027-02-28')).toEqual(['2027-02-28'])
  })
  it('anual desde 29 de febrero', () => {
    const a = base({ frequency: 'ANUAL', startDate: '2028-02-29' })
    expect(ruleDates(a, '2028-01-01', '2033-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28'
    ])
  })
  it('semanal mantiene el día de la semana y cruza el año', () => {
    const a = base({ frequency: 'SEMANAL', startDate: '2026-12-21' }) // lunes
    expect(ruleDates(a, '2026-12-25', '2027-01-12')).toEqual(['2026-12-28', '2027-01-04', '2027-01-11'])
  })
  it('quincenal (cada 2 semanas)', () => {
    const a = base({ frequency: 'SEMANAL', interval: 2, startDate: '2026-10-05' })
    expect(ruleDates(a, '2026-10-01', '2026-11-30')).toEqual(['2026-10-05', '2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30'])
  })
  it('trimestral y semestral', () => {
    const q = base({ frequency: 'TRIMESTRAL', startDate: '2026-03-31' })
    expect(ruleDates(q, '2026-01-01', '2026-12-31')).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31'])
    expect(ruleDates(q, '2026-01-01', '2026-12-31').map(d => periodKey(q, d))).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'])
    const s = base({ frequency: 'SEMESTRAL', startDate: '2026-05-10' })
    expect(ruleDates(s, '2026-01-01', '2027-12-31')).toEqual(['2026-05-10', '2026-11-10', '2027-05-10', '2027-11-10'])
  })
  it('diaria en días hábiles', () => {
    const a = base({ frequency: 'DIARIA', businessDaysOnly: true, startDate: '2026-10-01' })
    expect(ruleDates(a, '2026-10-09', '2026-10-13')).toEqual(['2026-10-09', '2026-10-12', '2026-10-13'])
  })
  it('única', () => {
    const a = base({ frequency: 'UNICA', startDate: '2026-10-20' })
    expect(ruleDates(a, '2026-10-01', '2026-10-31')).toEqual(['2026-10-20'])
    expect(ruleDates(a, '2026-11-01', '2026-11-30')).toEqual([])
  })
  it('respeta fecha de fin y vigencia', () => {
    const a = base({ startDate: '2026-01-10', endDate: '2026-03-31', effectiveFrom: '2026-02-01' })
    expect(ruleDates(a, '2026-01-01', '2026-12-31')).toEqual(['2026-02-10', '2026-03-10'])
  })
  it('ambas sucursales por separado generan dos ejecuciones independientes', () => {
    const a = base({ branch: 'AMBAS', splitBranches: true })
    const occ = occurrences(a, '2026-10-01', '2026-10-31')
    expect(occ.map(o => o.branch)).toEqual(['JUJUY', 'SALTA'])
    const b = base({ branch: 'AMBAS', splitBranches: false })
    expect(occurrences(b, '2026-10-01', '2026-10-31').map(o => o.branch)).toEqual(['AMBAS'])
  })
  it('actividades por evento con fecha relativa', () => {
    const a = base({ frequency: 'EVENTO', eventType: 'PCGC', offsetDays: -7, branch: 'AMBAS', splitBranches: true })
    const events: PlannerEvent[] = [
      { id: 'E1', type: 'PCGC', date: '2026-11-20', branch: 'JUJUY', state: 'ACTIVO', createdAt: '' },
      { id: 'E2', type: 'PCGC', date: '2026-11-25', branch: 'AMBAS', state: 'CANCELADO', createdAt: '' },
      { id: 'E3', type: 'ISO', date: '2026-11-25', branch: 'AMBAS', state: 'ACTIVO', createdAt: '' }
    ]
    const occ = occurrences(a, '2026-10-01', '2026-12-31', events)
    expect(occ).toEqual([{ period: 'E-E1', dueDate: '2026-11-13', branch: 'JUJUY', eventId: 'E1' }])
  })
  it('evento de cierre: informe posterior', () => {
    const a = base({ frequency: 'EVENTO', eventType: 'CIERRE_INDICADORES', offsetDays: 1, branch: 'AMBAS', splitBranches: false })
    const ev: PlannerEvent = { id: 'C10', type: 'CIERRE_INDICADORES', date: '2026-11-05', branch: 'AMBAS', state: 'ACTIVO', createdAt: '' }
    expect(occurrences(a, '2026-11-01', '2026-11-30', [ev])[0].dueDate).toBe('2026-11-06')
  })
  it('describe reglas', () => {
    expect(describeRule(base({ startDate: '2026-01-31' }))).toBe('Mensual · día 31 (o último)')
    expect(describeRule(base({ frequency: 'SEMANAL', startDate: '2026-10-12' }))).toBe('Semanal · lunes')
    expect(describeRule(base({ frequency: 'EVENTO', eventType: 'PCGC', offsetDays: -7 }))).toBe('PCGC · 7 días antes')
  })
})

describe('ejecuciones', () => {
  const today = '2026-10-15'
  const weekly = base({ id: 'W', frequency: 'SEMANAL', startDate: '2026-10-05', branch: 'AMBAS', splitBranches: true })

  it('sin duplicados al combinar guardadas y calculadas', () => {
    const virtuals = buildExecutions([weekly], [], [], '2026-10-01', '2026-10-31')
    expect(virtuals).toHaveLength(8) // 4 semanas × 2 sucursales
    const saved: Execution = { ...virtuals[0], virtual: false, status: 'REALIZADA' }
    const merged = buildExecutions([weekly], [saved, saved], [], '2026-10-01', '2026-10-31')
    expect(merged).toHaveLength(8)
    expect(merged.find(e => e.id === saved.id)?.status).toBe('REALIZADA')
  })

  it('una realizada no reaparece como pendiente en el mismo período aunque cambie el día', () => {
    const monthly = base({ id: 'M', startDate: '2026-10-05' })
    const done: Execution = { ...buildExecutions([monthly], [], [], '2026-10-01', '2026-10-31')[0], virtual: false, status: 'REALIZADA' }
    const moved = { ...monthly, startDate: '2026-10-20' }
    const list = buildExecutions([moved], [done], [], '2026-10-01', '2026-10-31')
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('REALIZADA')
  })

  it('un realizado en Jujuy y pendiente en Salta', () => {
    const list = buildExecutions([weekly], [], [], '2026-10-12', '2026-10-12')
    const jujuy = { ...list.find(e => e.branch === 'JUJUY')!, status: 'REALIZADA' as const, virtual: false }
    const merged = buildExecutions([weekly], [jujuy], [], '2026-10-12', '2026-10-12')
    expect(merged.map(e => [e.branch, e.status])).toEqual([['JUJUY', 'REALIZADA'], ['SALTA', 'PENDIENTE']])
  })

  it('cambio de mes: noviembre aparece y octubre conserva lo registrado', () => {
    const monthly = base({ id: 'M', startDate: '2026-10-05', branch: 'SALTA' })
    const oct: Execution = { ...buildExecutions([monthly], [], [], '2026-10-01', '2026-10-31')[0], virtual: false, status: 'REALIZADA', note: '15 órdenes' }
    const nov = buildExecutions([monthly], [oct], [], '2026-11-01', '2026-11-30')
    expect(nov).toHaveLength(1)
    expect(nov[0].status).toBe('PENDIENTE')
    expect(nov[0].id).not.toBe(oct.id)
    const octAgain = buildExecutions([monthly], [oct], [], '2026-10-01', '2026-10-31')
    expect(octAgain[0].note).toBe('15 órdenes')
  })

  it('materializa sólo lo vencido o del día, una única vez', () => {
    const toSave = pendingMaterialization([weekly], [], [], today)
    expect(toSave.map(e => e.dueDate)).toEqual(['2026-10-05', '2026-10-05', '2026-10-12', '2026-10-12'])
    expect(toSave.every(e => !e.virtual)).toBe(true)
    expect(pendingMaterialization([weekly], toSave, [], today)).toHaveLength(0)
  })

  it('pausar no borra el historial', () => {
    const saved = pendingMaterialization([weekly], [], [], today)
    const paused = { ...weekly, state: 'PAUSADA' as const }
    const list = buildExecutions([paused], saved, [], '2026-10-01', '2026-10-31')
    expect(list).toHaveLength(4)
  })

  it('cambio de frecuencia no altera ejecuciones históricas y limpia previsiones intactas', () => {
    const saved = pendingMaterialization([weekly], [], [], today)
    const future: Execution = { ...buildExecutions([weekly], [], [], '2026-10-19', '2026-10-19')[0], virtual: false }
    const futureWithNote: Execution = { ...buildExecutions([weekly], [], [], '2026-10-26', '2026-10-26')[0], virtual: false, note: 'pedir docs' }
    const all = [...saved, future, futureWithNote]
    const next = { ...weekly, frequency: 'MENSUAL' as const, startDate: '2026-10-28', effectiveFrom: today }
    expect(ruleChanged(weekly, next)).toBe(true)
    const r = reconcileAfterRuleChange(next, all, [], today)
    expect(r.remove).toEqual([future.id])
    expect(r.update).toEqual([])
    const kept = all.filter(e => !r.remove.includes(e.id))
    const oct = buildExecutions([next], kept, [], '2026-10-01', '2026-10-31')
    // historial (4) + nota conservada (1) + nueva mensual 28/10 (2 sucursales)
    expect(oct.filter(e => e.dueDate < today)).toHaveLength(4)
    expect(oct.find(e => e.note === 'pedir docs')).toBeTruthy()
    expect(oct.filter(e => e.dueDate === '2026-10-28')).toHaveLength(2)
  })

  it('reprogramar una ejecución fuera del rango no la duplica', () => {
    const monthly = base({ id: 'M', startDate: '2026-10-05' })
    const v = buildExecutions([monthly], [], [], '2026-10-01', '2026-10-31')[0]
    const moved: Execution = { ...v, virtual: false, dueDate: '2026-11-02' }
    expect(buildExecutions([monthly], [moved], [], '2026-10-01', '2026-10-31')).toHaveLength(0)
  })

  it('estados visuales', () => {
    expect(visualState({ status: 'PENDIENTE', dueDate: '2026-10-14' }, today)).toBe('overdue')
    expect(visualState({ status: 'EN_CURSO', dueDate: '2026-10-20' }, today)).toBe('progress')
    expect(visualState({ status: 'PENDIENTE', dueDate: '2026-10-17' }, today, 3)).toBe('soon')
    expect(visualState({ status: 'PENDIENTE', dueDate: '2026-10-30' }, today, 3)).toBe('pending')
    expect(visualState({ status: 'NO_REALIZADA', dueDate: '2026-10-01' }, today)).toBe('notdone')
    expect(visualState({ status: 'REALIZADA', dueDate: '2026-10-01' }, today)).toBe('done')
  })

  it('resumen calculado desde las ejecuciones', () => {
    const list = buildExecutions([weekly], [], [], '2026-10-01', '2026-10-31')
    list[0] = { ...list[0], status: 'REALIZADA' }
    list[1] = { ...list[1], status: 'NO_REALIZADA' }
    expect(summarize(list, today)).toEqual({ previstas: 8, realizadas: 1, noRealizadas: 1, vencidas: 2, pendientes: 4 })
  })

  it('reasignación sólo para esa ejecución y filtros por persona/sucursal', () => {
    const list = buildExecutions([weekly], [], [], '2026-10-19', '2026-10-19')
    const reassigned = { ...list[0], executor: 'RAC' as const }
    expect(weekly.responsible).toBe('ANALISTA')
    expect(matchesFilter(reassigned, { person: 'RAC' }, weekly, today)).toBe(true)
    expect(matchesFilter(list[1], { person: 'RAC' }, weekly, today)).toBe(false)
    expect(matchesFilter(list[1], { branch: 'SALTA' }, weekly, today)).toBe(true)
    expect(matchesFilter(list[1], { branch: 'JUJUY' }, weekly, today)).toBe(false)
  })

  it('completar guarda fecha y ejecutor', () => {
    const p = completionPatch('RAC', '2026-10-15T18:00:00Z')
    expect(p).toEqual({ status: 'REALIZADA', completedAt: '2026-10-15T18:00:00Z', completedBy: 'RAC', executor: 'RAC' })
  })

  it('IDs determinísticos', () => {
    expect(executionId('A', '2026-10', 'SALTA')).toBe('A__2026-10__SALTA')
  })
})

