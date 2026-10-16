import { describe, expect, it } from 'vitest'
import type { Activity, Execution, PlannerEvent } from '../../types'
import { addMonthsClamped, isoWeekKey, isLeapYear, isValidISO, addDays } from '../dates'
import { occurrences, ruleDates, executionId, periodKey } from '../recurrence'
import {
  buildExecutions, buildTodayView, buildWeekView, pendingMaterialization,
  reconcileAfterRuleChange, summarize, visualState,
  matchesFilter, completionPatch, ruleChanged,
  deduplicateActivities, groupExecutionsByActivity,
  toggleJointCompletion, toggleIndividualConfirmation
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
    expect(describeRule(base({ frequency: 'EVENTO', eventType: 'PCGC', offsetDays: -7 }))).toBe('Auditoría PCGC · 7 días antes')
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

describe('Etapa 2 — Reglas de Agenda (Hoy, Semana, Ventanas Mensuales y Flexibles)', () => {
  it('actividad semanal fija en martes aparece en Hoy el martes y no el lunes', () => {
    const tuesdayTask = base({
      id: 'SEM_MAR',
      name: 'Viaje de trabajo a Salta',
      frequency: 'SEMANAL',
      startDate: '2026-10-13', // martes
      flexible: false,
      branch: 'SALTA'
    })
    const onMonday = buildTodayView([tuesdayTask], [], [], '2026-10-12')
    expect(onMonday.todayTasks).toHaveLength(0)
    expect(onMonday.flexibleSoon).toHaveLength(0)

    const onTuesday = buildTodayView([tuesdayTask], [], [], '2026-10-13')
    expect(onTuesday.todayTasks).toHaveLength(1)
    expect(onTuesday.todayTasks[0].activityId).toBe('SEM_MAR')
  })

  it('actividad semanal flexible (vence viernes) aparece en Semana desde el lunes y se destaca en Hoy al acercarse el viernes', () => {
    const flexFri = base({
      id: 'SEM_FLEX',
      name: 'Avanzar con documentación ambiental',
      frequency: 'SEMANAL',
      startDate: '2026-10-16', // viernes
      flexible: true,
      branch: 'AMBAS',
      splitBranches: false
    })

    // Lunes 12/10: está en Semana -> Flexibles de la semana, pero no satura Hoy
    const weekOnMon = buildWeekView([flexFri], [], [], '2026-10-12', '2026-10-12')
    expect(weekOnMon.flexibleWeek).toHaveLength(1)
    expect(weekOnMon.flexibleWeek[0].dueDate).toBe('2026-10-16')

    const todayOnMon = buildTodayView([flexFri], [], [], '2026-10-12')
    expect(todayOnMon.todayTasks).toHaveLength(0)
    expect(todayOnMon.flexibleSoon).toHaveLength(0)

    // Jueves 15/10 (a 1 día del viernes): se destaca en Hoy -> Próximas a vencer
    const todayOnThu = buildTodayView([flexFri], [], [], '2026-10-15')
    expect(todayOnThu.flexibleSoon).toHaveLength(1)
    expect(todayOnThu.flexibleSoon[0].activityId).toBe('SEM_FLEX')

    // Viernes 16/10: pasa a Para hoy
    const todayOnFri = buildTodayView([flexFri], [], [], '2026-10-16')
    expect(todayOnFri.todayTasks).toHaveLength(1)
  })

  it('actividad mensual con ventana 7 al 10 genera una sola ejecución, permanece activa en Hoy entre el 7 y el 10, y desaparece de pendientes al completarse', () => {
    const cem = base({
      id: 'CEM',
      name: 'Comunicar resultados CEM del mes anterior',
      frequency: 'MENSUAL',
      startDate: '2026-10-01',
      windowStartDay: 7,
      windowEndDay: 10,
      branch: 'AMBAS',
      splitBranches: false
    })

    // Genera una única ejecución en el mes
    const octList = buildExecutions([cem], [], [], '2026-10-01', '2026-10-31')
    expect(octList).toHaveLength(1)
    expect(octList[0].windowStart).toBe('2026-10-07')
    expect(octList[0].dueDate).toBe('2026-10-10')

    // Día 6: aún fuera de ventana
    expect(buildTodayView([cem], [], [], '2026-10-06').todayTasks).toHaveLength(0)

    // Días 7, 8, 9 y 10: activa en Para hoy mientras siga pendiente
    for (const day of ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']) {
      const view = buildTodayView([cem], [], [], day)
      expect(view.todayTasks).toHaveLength(1)
      expect(view.todayTasks[0].id).toBe('CEM__2026-10__AMBAS')
    }

    // Si se marca realizada el día 8, desaparece de pendientes el 8, 9 y 10
    const completedOn8: Execution = {
      ...octList[0],
      virtual: false,
      status: 'REALIZADA',
      completedAt: '2026-10-08T14:00:00Z',
      completedBy: 'RAC',
      executor: 'RAC'
    }
    const viewAfterDoneOn8 = buildTodayView([cem], [completedOn8], [], '2026-10-08')
    expect(viewAfterDoneOn8.todayTasks).toHaveLength(0)
    expect(viewAfterDoneOn8.completedToday).toHaveLength(1)

    const viewOn9AfterDone = buildTodayView([cem], [completedOn8], [], '2026-10-09')
    expect(viewOn9AfterDone.todayTasks).toHaveLength(0)
    expect(viewOn9AfterDone.overdueTasks).toHaveLength(0)
  })

  it('actividades diarias vencidas (2 o más días) se agrupan de forma compacta en dailyBacklog sin saturar overdueTasks', () => {
    const daily = base({
      id: 'IPSOS',
      name: 'Actualizar IPSOS',
      frequency: 'DIARIA',
      businessDaysOnly: true,
      startDate: '2026-10-05',
      branch: 'AMBAS',
      splitBranches: false
    })
    // Hoy viernes 2026-10-09: lunes 5, martes 6, miércoles 7 y jueves 8 están vencidas (4 días)
    const view = buildTodayView([daily], [], [], '2026-10-09')
    expect(view.todayTasks).toHaveLength(1) // viernes 9
    expect(view.overdueTasks).toHaveLength(0) // no satura la lista individual
    expect(view.dailyBacklog).toHaveLength(1)
    expect(view.dailyBacklog[0].items).toHaveLength(4)
  })
})

describe('Etapa 4: Modalidades de cumplimiento y deduplicación', () => {
  it('deduplicateActivities elimina duplicados conservando la actividad más completa', () => {
    const act1 = base({ id: 'uuid-1', importId: 'D01', name: 'Gestión Reclamos', frequency: 'DIARIA' })
    const act2 = base({ id: 'uuid-2', importId: 'D01', name: 'Gestión Reclamos', frequency: 'DIARIA', completionMode: 'CUALQUIERA' })
    const act3 = base({ id: 'uuid-3', name: 'Control de cajas', frequency: 'SEMANAL' })
    const act4 = base({ id: 'uuid-4', name: 'Control de cajas', frequency: 'SEMANAL' })

    const deduped = deduplicateActivities([act1, act2, act3, act4])
    expect(deduped).toHaveLength(2)
  })

  it('groupExecutionsByActivity agrupa ejecuciones de Jujuy y Salta de una misma actividad', () => {
    const act = base({ id: 'act-1', name: 'Revisión IPSOS', branch: 'AMBAS', splitBranches: true })
    const exJujuy: Execution = {
      id: 'ex-jujuy',
      activityId: 'act-1',
      activityName: 'Revisión IPSOS',
      dueDate: '2026-10-16',
      period: '2026-10-16',
      branch: 'JUJUY',
      executor: 'RAC',
      status: 'PENDIENTE',
      createdAt: '2026-10-16'
    }
    const exSalta: Execution = {
      id: 'ex-salta',
      activityId: 'act-1',
      activityName: 'Revisión IPSOS',
      dueDate: '2026-10-16',
      period: '2026-10-16',
      branch: 'SALTA',
      executor: 'RAC',
      status: 'PENDIENTE',
      createdAt: '2026-10-16'
    }

    const map = new Map([['act-1', act]])
    const grouped = groupExecutionsByActivity([exJujuy, exSalta], map)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].activityName).toBe('Revisión IPSOS')
    expect(grouped[0].items).toHaveLength(2)
  })

  it('toggleJointCompletion registra participantes conjuntos de RAC y Analista', () => {
    const ex: Execution = {
      id: 'ex-joint',
      activityId: 'act-1',
      dueDate: '2026-10-16',
      period: '2026-10-16',
      branch: 'JUJUY',
      executor: 'RAC',
      status: 'PENDIENTE',
      completionMode: 'CONJUNTA',
      createdAt: '2026-10-16'
    }

    const patch = toggleJointCompletion(ex, 'RAC', ['RAC', 'ANALISTA'])
    expect(patch.status).toBe('REALIZADA')
    expect(patch.participants).toEqual(['RAC', 'ANALISTA'])
    expect(patch.executor).toBe('RAC')
  })

  it('toggleIndividualConfirmation maneja doble confirmación 1/2 -> realizada', () => {
    const ex: Execution = {
      id: 'ex-double',
      activityId: 'act-1',
      dueDate: '2026-10-16',
      period: '2026-10-16',
      branch: 'JUJUY',
      executor: 'RAC',
      status: 'PENDIENTE',
      completionMode: 'AMBOS_INDIVIDUAL',
      createdAt: '2026-10-16'
    }

    // Primera confirmación por RAC
    const firstStep = toggleIndividualConfirmation(ex, 'RAC')
    expect(firstStep.status).toBe('EN_CURSO')
    expect(firstStep.confirmations?.RAC?.status).toBe('REALIZADA')
    expect(firstStep.confirmations?.ANALISTA?.status).toBe('PENDIENTE')

    // Segunda confirmación por ANALISTA
    const updatedEx: Execution = { ...ex, ...firstStep }
    const secondStep = toggleIndividualConfirmation(updatedEx, 'ANALISTA')
    expect(secondStep.status).toBe('REALIZADA')
    expect(secondStep.confirmations?.ANALISTA?.status).toBe('REALIZADA')

    // Si RAC vuelve a confirmar sobre el estado final, desmarca su confirmación volviendo a EN_CURSO
    const doneEx: Execution = { ...updatedEx, ...secondStep }
    const uncheckStep = toggleIndividualConfirmation(doneEx, 'RAC')
    expect(uncheckStep.status).toBe('EN_CURSO')
    expect(uncheckStep.confirmations?.RAC?.status).toBe('PENDIENTE')
    expect(uncheckStep.confirmations?.ANALISTA?.status).toBe('REALIZADA')
  })
})


