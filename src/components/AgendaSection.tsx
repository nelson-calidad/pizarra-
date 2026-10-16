import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, CalendarClock, SlidersHorizontal,
  Check, Ban, ChevronDown, ChevronUp, Edit3, Copy, PauseCircle, PlayCircle,
  Trash2, Sparkles, CheckCircle2, Upload
} from 'lucide-react'
import type {
  Activity, AgendaView, BranchScope, Execution, ExecStatus, Note, PlannerEvent, Role
} from '../types'
import {
  addDays, capitalize, daysInMonth, endOfMonth, fromParts, longDate,
  monthLabel, parseISO, shortDate, weekday, weekdayName
} from '../lib/dates'
import {
  BRANCH_LABEL, BRANCH_SHORT, describeRule, eventTypeLabel, FREQ_LABEL, ROLE_LABEL
} from '../lib/labels'
import {
  buildExecutions, buildTodayView, buildWeekView, leadDaysFor, matchesFilter,
  visualState, type DailyBacklogGroup
} from '../lib/planner'
import { ExecutionRow } from './ExecutionRow'
import { ImportModal } from './ImportModal'
import { SUGGESTED_TEMPLATES, type ActivityTemplate } from '../lib/templates'

type Props = {
  activities: Activity[]
  persistedExecutions: Execution[]
  events: PlannerEvent[]
  notes: Note[]
  today: string
  currentUser: Role
  personFilter: Role | 'TODOS'
  onPersonFilterChange: (p: Role | 'TODOS') => void
  branchFilter: BranchScope | 'TODAS'
  onBranchFilterChange: (b: BranchScope | 'TODAS') => void
  query: string
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onBatchResolveBacklog: (items: Execution[], status: ExecStatus, reason?: string) => void
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onRescheduleExecution: (ex: Execution, newDate: string) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelectExecution: (ex: Execution) => void
  onSelectNote: (n: Note) => void
  onOpenNewActivity: (prefill?: Partial<Activity>) => void
  onEditActivity: (act: Activity) => void
  onDuplicateActivity: (act: Activity) => void
  onTogglePauseActivity: (act: Activity) => void
  onDeleteActivity: (act: Activity) => void
  onOpenEvents: () => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
  onImportActivities: (acts: Activity[]) => void
}

export function AgendaSection({
  activities,
  persistedExecutions,
  events,
  notes,
  today,
  currentUser,
  personFilter,
  onPersonFilterChange,
  branchFilter,
  onBranchFilterChange,
  query,
  onChangeStatus,
  onBatchResolveBacklog,
  onChangeExecutor,
  onRescheduleExecution,
  onSaveObservation,
  onSelectExecution,
  onSelectNote,
  onOpenNewActivity,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity,
  onDeleteActivity,
  onOpenEvents,
  onQuickCreateTemplate,
  onImportActivities
}: Props) {
  // Vista inicial de Agenda: HOY (Punto 3)
  const [agendaView, setAgendaView] = useState<AgendaView>('today')
  const [showCatalog, setShowCatalog] = useState(false)
  const [showCompletedToday, setShowCompletedToday] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Fecha de referencia para Semana y Mes
  const [weekRef, setWeekRef] = useState(today)
  const initParts = parseISO(today)
  const [calYear, setCalYear] = useState(initParts.y)
  const [calMonth, setCalMonth] = useState(initParts.m)
  const [selectedCalDate, setSelectedCalDate] = useState(today)

  const actMap = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities])
  const activeActivities = useMemo(
    () => activities.filter(a => a.state !== 'INACTIVA'),
    [activities]
  )

  const filter = useMemo(
    () => ({ person: personFilter, branch: branchFilter, query }),
    [personFilter, branchFilter, query]
  )

  // ---- Modelo HOY ----
  const todayModel = useMemo(
    () => buildTodayView(activities, persistedExecutions, events, today, filter),
    [activities, persistedExecutions, events, today, filter]
  )

  const todayEvents = useMemo(
    () =>
      events.filter(
        ev =>
          ev.state === 'ACTIVO' &&
          ev.date === today &&
          (branchFilter === 'TODAS' || ev.branch === 'AMBAS' || ev.branch === branchFilter)
      ),
    [events, today, branchFilter]
  )

  // ---- Modelo SEMANA ----
  const weekModel = useMemo(
    () => buildWeekView(activities, persistedExecutions, events, weekRef, today, filter),
    [activities, persistedExecutions, events, weekRef, today, filter]
  )

  // ---- Modelo MES ----
  const mStart = fromParts(calYear, calMonth, 1)
  const mEnd = endOfMonth(mStart)
  const startDow = weekday(mStart)
  const totalDays = daysInMonth(calYear, calMonth)

  const monthExecutions = useMemo(() => {
    const raw = buildExecutions(activities, persistedExecutions, events, mStart, mEnd)
    return raw.filter(e => matchesFilter(e, filter, actMap.get(e.activityId), today))
  }, [activities, persistedExecutions, events, mStart, mEnd, filter, actMap, today])

  const monthEvents = useMemo(
    () =>
      events.filter(
        ev =>
          ev.state === 'ACTIVO' &&
          ev.date >= mStart &&
          ev.date <= mEnd &&
          (branchFilter === 'TODAS' || ev.branch === 'AMBAS' || ev.branch === branchFilter)
      ),
    [events, mStart, mEnd, branchFilter]
  )

  const stepMonth = (dir: -1 | 1) => {
    const total = calYear * 12 + (calMonth - 1) + dir
    const ny = Math.floor(total / 12)
    const nm = (total % 12) + 1
    setCalYear(ny)
    setCalMonth(nm)
    setSelectedCalDate(fromParts(ny, nm, 1))
  }

  const totalPendingToday =
    todayModel.todayTasks.length +
    todayModel.overdueTasks.length +
    todayModel.dailyBacklog.length

  return (
    <section className="agenda-page">
      {/* Barra superior minimalista: Hoy / Semana / Mes + Filtros discretos */}
      <div className="agenda-toolbar">
        <div className="agenda-views-tabs" role="tablist" aria-label="Vistas de Agenda">
          <button
            type="button"
            role="tab"
            aria-selected={agendaView === 'today' && !showCatalog}
            className={`agenda-tab-btn ${agendaView === 'today' && !showCatalog ? 'active' : ''}`}
            onClick={() => {
              setShowCatalog(false)
              setAgendaView('today')
            }}
          >
            <span>Hoy</span>
            {totalPendingToday > 0 && <em className="tab-pill">{totalPendingToday}</em>}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={agendaView === 'week' && !showCatalog}
            className={`agenda-tab-btn ${agendaView === 'week' && !showCatalog ? 'active' : ''}`}
            onClick={() => {
              setShowCatalog(false)
              setAgendaView('week')
            }}
          >
            <span>Semana</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={agendaView === 'month' && !showCatalog}
            className={`agenda-tab-btn ${agendaView === 'month' && !showCatalog ? 'active' : ''}`}
            onClick={() => {
              setShowCatalog(false)
              setAgendaView('month')
            }}
          >
            <span>Mes</span>
          </button>
        </div>

        {/* Filtros minimalistas (Punto 8) */}
        <div className="agenda-filters">
          <div className="segmented-control segmented-xs" aria-label="Filtro por persona">
            <button
              type="button"
              className={personFilter === 'TODOS' ? 'active' : ''}
              onClick={() => onPersonFilterChange('TODOS')}
            >
              Todos
            </button>
            <button
              type="button"
              className={personFilter === 'RAC' ? 'active' : ''}
              onClick={() => onPersonFilterChange('RAC')}
            >
              RAC
            </button>
            <button
              type="button"
              className={personFilter === 'ANALISTA' ? 'active' : ''}
              onClick={() => onPersonFilterChange('ANALISTA')}
            >
              Analista
            </button>
          </div>

          <div className="segmented-control segmented-xs" aria-label="Filtro por sucursal">
            <button
              type="button"
              className={branchFilter === 'TODAS' ? 'active' : ''}
              onClick={() => onBranchFilterChange('TODAS')}
            >
              Ambas sucursales
            </button>
            <button
              type="button"
              className={branchFilter === 'JUJUY' ? 'active' : ''}
              onClick={() => onBranchFilterChange('JUJUY')}
            >
              Jujuy
            </button>
            <button
              type="button"
              className={branchFilter === 'SALTA' ? 'active' : ''}
              onClick={() => onBranchFilterChange('SALTA')}
            >
              Salta
            </button>
          </div>

          {/* Acceso discreto a Eventos, Catálogo e Importación */}
          <button
            type="button"
            className="btn-discreet"
            onClick={() => setImportOpen(true)}
            title="Importar catálogo de actividades desde archivo JSON"
          >
            <Upload size={14} />
            <span>Importar</span>
          </button>

          <button
            type="button"
            className="btn-discreet"
            onClick={onOpenEvents}
            title="Registrar fecha confirmada de PCGC, cierre de indicadores, auditoría o visita"
          >
            <CalendarClock size={14} />
            <span>Eventos</span>
          </button>

          <button
            type="button"
            className={`btn-discreet ${showCatalog ? 'active' : ''}`}
            onClick={() => setShowCatalog(s => !s)}
            title="Administrar catálogo de actividades recurrentes"
          >
            <SlidersHorizontal size={14} />
            <span>Catálogo ({activeActivities.length})</span>
          </button>
        </div>
      </div>

      {/* PANEL DISCRETO DE CATÁLOGO DE REGLAS */}
      {showCatalog ? (
        <CatalogView
          activities={activeActivities}
          onOpenNewActivity={onOpenNewActivity}
          onEditActivity={onEditActivity}
          onDuplicateActivity={onDuplicateActivity}
          onTogglePauseActivity={onTogglePauseActivity}
          onDeleteActivity={onDeleteActivity}
          onQuickCreateTemplate={onQuickCreateTemplate}
          onOpenImport={() => setImportOpen(true)}
          onClose={() => setShowCatalog(false)}
        />
      ) : activeActivities.length === 0 && persistedExecutions.length === 0 ? (
        <OnboardingEmpty
          onOpenNewActivity={onOpenNewActivity}
          onQuickCreateTemplate={onQuickCreateTemplate}
          onOpenImport={() => setImportOpen(true)}
        />
      ) : agendaView === 'today' ? (
        /* =========================================================
           VISTA 1: HOY (La pantalla más importante)
           ========================================================= */
        <div className="today-container">
          <div className="today-header-line">
            <div>
              <h1 className="today-title">{longDate(today)}</h1>
              <p className="today-sub">
                {totalPendingToday === 0
                  ? 'Todo al día.'
                  : `${totalPendingToday} ${
                      totalPendingToday === 1 ? 'actividad pendiente' : 'actividades pendientes'
                    }`}
                {todayModel.completedToday.length > 0 &&
                  ` · ${todayModel.completedToday.length} realizada${
                    todayModel.completedToday.length === 1 ? '' : 's'
                  }`}
              </p>
            </div>
          </div>

          {todayEvents.length > 0 && (
            <div className="today-events-strip">
              {todayEvents.map(ev => (
                <div className="today-event-chip" key={ev.id} onClick={onOpenEvents}>
                  <span>★ Hoy: {ev.title || eventTypeLabel(ev.type)}</span>
                  <span className={`branch-pill branch-${ev.branch.toLowerCase()}`}>
                    {BRANCH_LABEL[ev.branch]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 1. Vencidas y atraso compacto de diarias */}
          {(todayModel.overdueTasks.length > 0 || todayModel.dailyBacklog.length > 0) && (
            <div className="exec-group group-overdue">
              <div className="exec-group-header">
                <h2>Vencidas pendientes</h2>
                <span className="group-count-pill tone-danger">
                  {todayModel.overdueTasks.length + todayModel.dailyBacklog.length}
                </span>
              </div>
              <div className="exec-group-list">
                {todayModel.dailyBacklog.map(bg => (
                  <DailyBacklogRow
                    key={`${bg.activityId}__${bg.branch}`}
                    group={bg}
                    onResolveAll={(status, reason) =>
                      onBatchResolveBacklog(bg.items, status, reason)
                    }
                  />
                ))}
                {todayModel.overdueTasks.map(ex => (
                  <ExecutionRow
                    key={ex.id}
                    execution={ex}
                    activity={actMap.get(ex.activityId)}
                    today={today}
                    currentUser={currentUser}
                    onChangeStatus={onChangeStatus}
                    onChangeExecutor={onChangeExecutor}
                    onReschedule={onRescheduleExecution}
                    onSaveObservation={onSaveObservation}
                    onSelect={onSelectExecution}
                    onEditActivity={onEditActivity}
                    onDuplicateActivity={onDuplicateActivity}
                    onTogglePauseActivity={onTogglePauseActivity}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2. Actividades para hoy (diarias, semanales de hoy, o en ventana activa del 7 al 10) */}
          <div className="exec-group">
            <div className="exec-group-header">
              <h2>Para hacer hoy</h2>
              <span className="group-count-pill tone-neutral">
                {todayModel.todayTasks.length}
              </span>
            </div>
            {todayModel.todayTasks.length === 0 ? (
              <div className="today-done-banner">
                <CheckCircle2 size={20} />
                <span>No quedan actividades pendientes programadas para hoy.</span>
              </div>
            ) : (
              <div className="exec-group-list">
                {todayModel.todayTasks.map(ex => (
                  <ExecutionRow
                    key={ex.id}
                    execution={ex}
                    activity={actMap.get(ex.activityId)}
                    today={today}
                    currentUser={currentUser}
                    onChangeStatus={onChangeStatus}
                    onChangeExecutor={onChangeExecutor}
                    onReschedule={onRescheduleExecution}
                    onSaveObservation={onSaveObservation}
                    onSelect={onSelectExecution}
                    onEditActivity={onEditActivity}
                    onDuplicateActivity={onDuplicateActivity}
                    onTogglePauseActivity={onTogglePauseActivity}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 3. Apartado secundario: Flexibles próximas a vencer */}
          {todayModel.flexibleSoon.length > 0 && (
            <div className="exec-group group-secondary">
              <div className="exec-group-header">
                <h2>Próximas a vencer</h2>
                <span className="group-count-pill tone-warning">
                  {todayModel.flexibleSoon.length}
                </span>
              </div>
              <div className="exec-group-list">
                {todayModel.flexibleSoon.map(ex => (
                  <ExecutionRow
                    key={ex.id}
                    execution={ex}
                    activity={actMap.get(ex.activityId)}
                    today={today}
                    currentUser={currentUser}
                    onChangeStatus={onChangeStatus}
                    onChangeExecutor={onChangeExecutor}
                    onReschedule={onRescheduleExecution}
                    onSaveObservation={onSaveObservation}
                    onSelect={onSelectExecution}
                    onEditActivity={onEditActivity}
                    onDuplicateActivity={onDuplicateActivity}
                    onTogglePauseActivity={onTogglePauseActivity}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 4. Realizadas (compactas y colapsables para no ocupar pantalla) */}
          {todayModel.completedToday.length > 0 && (
            <div className="completed-compact-box">
              <button
                type="button"
                className="completed-toggle-btn"
                onClick={() => setShowCompletedToday(s => !s)}
              >
                <Check size={14} />
                <span>
                  Realizadas ({todayModel.completedToday.length})
                </span>
                {showCompletedToday ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showCompletedToday && (
                <div className="exec-group-list">
                  {todayModel.completedToday.map(ex => (
                    <ExecutionRow
                      key={ex.id}
                      execution={ex}
                      activity={actMap.get(ex.activityId)}
                      today={today}
                      currentUser={currentUser}
                      compact
                      onChangeStatus={onChangeStatus}
                      onChangeExecutor={onChangeExecutor}
                      onSaveObservation={onSaveObservation}
                      onSelect={onSelectExecution}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : agendaView === 'week' ? (
        /* =========================================================
           VISTA 2: SEMANA (Lunes a Domingo + Flexibles de la semana)
           ========================================================= */
        <div className="week-container">
          <div className="period-nav-group">
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => setWeekRef(d => addDays(d, -7))}
              title="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="week-range-title">
              Semana del {shortDate(weekModel.weekStart)} al {shortDate(weekModel.weekEnd)}
            </h2>
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => setWeekRef(d => addDays(d, 7))}
              title="Semana siguiente"
            >
              <ChevronRight size={16} />
            </button>
            {weekModel.weekStart !== buildWeekView([], [], [], today, today).weekStart && (
              <button
                type="button"
                className="btn-today-chip"
                onClick={() => setWeekRef(today)}
              >
                Esta semana
              </button>
            )}
          </div>

          {/* Apartado discreto: Flexibles de la semana */}
          {weekModel.flexibleWeek.length > 0 && (
            <div className="exec-group week-flexibles-box">
              <div className="exec-group-header">
                <h2>Flexibles de la semana</h2>
                <span className="group-count-pill tone-info">
                  {weekModel.flexibleWeek.filter(e => e.status !== 'REALIZADA').length} pendientes
                </span>
              </div>
              <div className="exec-group-list">
                {weekModel.flexibleWeek.map(ex => (
                  <ExecutionRow
                    key={ex.id}
                    execution={ex}
                    activity={actMap.get(ex.activityId)}
                    today={today}
                    currentUser={currentUser}
                    compact={ex.status === 'REALIZADA'}
                    onChangeStatus={onChangeStatus}
                    onChangeExecutor={onChangeExecutor}
                    onReschedule={onRescheduleExecution}
                    onSaveObservation={onSaveObservation}
                    onSelect={onSelectExecution}
                    onEditActivity={onEditActivity}
                    onDuplicateActivity={onDuplicateActivity}
                    onTogglePauseActivity={onTogglePauseActivity}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Días de lunes a domingo (destacando días laborables) */}
          <div className="week-days-stack">
            {weekModel.days.map(day => {
              const dayEvents = events.filter(
                ev =>
                  ev.state === 'ACTIVO' &&
                  ev.date === day.date &&
                  (branchFilter === 'TODAS' ||
                    ev.branch === 'AMBAS' ||
                    ev.branch === branchFilter)
              )
              if (!day.isBusinessDay && day.items.length === 0 && dayEvents.length === 0) {
                return (
                  <div key={day.date} className="week-day-card is-weekend-empty">
                    <span className="week-day-label">
                      {capitalize(weekdayName(day.date))} {shortDate(day.date)}
                    </span>
                    <small className="weekend-quiet">Fin de semana · sin actividades</small>
                  </div>
                )
              }

              return (
                <div
                  key={day.date}
                  className={`week-day-card ${day.isToday ? 'is-today' : ''} ${
                    day.isBusinessDay ? 'is-workday' : 'is-weekend'
                  }`}
                >
                  <div className="week-day-header">
                    <div className="week-day-title">
                      <b>{capitalize(weekdayName(day.date))}</b>
                      <span>{shortDate(day.date)}</span>
                      {day.isToday && <em className="today-pill-badge">HOY</em>}
                    </div>
                    <span className="week-day-count">
                      {day.items.filter(i => i.status === 'REALIZADA').length}/{day.items.length}
                    </span>
                  </div>

                  {dayEvents.map(ev => (
                    <div key={ev.id} className="week-event-banner" onClick={onOpenEvents}>
                      ★ {ev.title || eventTypeLabel(ev.type)} ({BRANCH_LABEL[ev.branch]})
                    </div>
                  ))}

                  {day.items.length === 0 ? (
                    <p className="week-day-empty">Sin actividades fijas programadas.</p>
                  ) : (
                    <div className="exec-group-list">
                      {day.items.map(ex => (
                        <ExecutionRow
                          key={ex.id}
                          execution={ex}
                          activity={actMap.get(ex.activityId)}
                          today={today}
                          currentUser={currentUser}
                          compact={ex.status === 'REALIZADA'}
                          onChangeStatus={onChangeStatus}
                          onChangeExecutor={onChangeExecutor}
                          onReschedule={onRescheduleExecution}
                          onSaveObservation={onSaveObservation}
                          onSelect={onSelectExecution}
                          onEditActivity={onEditActivity}
                          onDuplicateActivity={onDuplicateActivity}
                          onTogglePauseActivity={onTogglePauseActivity}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* =========================================================
           VISTA 3: MES (Calendario limpio + detalle del día seleccionado)
           ========================================================= */
        <div className="month-container">
          <div className="period-nav-group" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => stepMonth(-1)}
              title="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="week-range-title">{monthLabel(mStart.slice(0, 7))}</h2>
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => stepMonth(1)}
              title="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="btn-today-chip"
              onClick={() => {
                setCalYear(initParts.y)
                setCalMonth(initParts.m)
                setSelectedCalDate(today)
              }}
            >
              Hoy
            </button>
          </div>

          <div className="month-split-layout">
            <div className="calendar-container month-grid-card">
              <div className="calhead">
                {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(x => (
                  <span key={x}>{x}</span>
                ))}
              </div>
              <div className="grid">
                {Array.from({ length: startDow }, (_, i) => (
                  <div className="empty-day" key={'b' + i} />
                ))}
                {Array.from({ length: totalDays }, (_, i) => {
                  const day = i + 1
                  const ds = fromParts(calYear, calMonth, day)
                  // En las celdas del calendario NO mostramos todas las diarias para no saturar (Punto 6);
                  // sí mostramos los hitos/controles no diarios y un indicador compacto del total del día.
                  const dayAllExecs = monthExecutions.filter(
                    e =>
                      e.dueDate === ds ||
                      (e.windowStart && e.windowStart <= ds && ds <= e.dueDate && e.dueDate === ds)
                  )
                  const nonDailyExecs = dayAllExecs.filter(
                    e => actMap.get(e.activityId)?.frequency !== 'DIARIA'
                  )
                  const dailyCount = dayAllExecs.length - nonDailyExecs.length
                  const dayEvents = monthEvents.filter(ev => ev.date === ds)
                  const dayNotes = notes.filter(
                    n => n.status !== 'ARCHIVADO' && n.date === ds
                  )

                  const hasOverdue = dayAllExecs.some(
                    e => visualState(e, today, leadDaysFor(actMap.get(e.activityId))) === 'overdue'
                  )
                  const allDone =
                    dayAllExecs.length > 0 &&
                    dayAllExecs.every(e => e.status === 'REALIZADA')

                  return (
                    <div
                      key={day}
                      className={`cal-cell ${ds === today ? 'now' : ''} ${
                        ds === selectedCalDate ? 'cal-cell-selected' : ''
                      }`}
                      onClick={() => setSelectedCalDate(ds)}
                    >
                      <div className="cell-header">
                        <span className="cell-num">{day}</span>
                        <div className="cell-dots-indicator">
                          {hasOverdue && <span className="mini-dot dot-overdue" title="Con vencidas" />}
                          {allDone && <span className="mini-dot dot-done" title="Todo realizado" />}
                          {dayAllExecs.length > 0 && (
                            <span className="cell-count-tag">{dayAllExecs.length}</span>
                          )}
                        </div>
                      </div>

                      <div className="cell-notes">
                        {dayEvents.map(ev => (
                          <div
                            key={ev.id}
                            className="cal-event-pill"
                            title={ev.title || eventTypeLabel(ev.type)}
                          >
                            ★ {ev.title || eventTypeLabel(ev.type)}
                          </div>
                        ))}

                        {nonDailyExecs.slice(0, 2).map(ex => {
                          const act = actMap.get(ex.activityId)
                          const v = visualState(ex, today, leadDaysFor(act), act)
                          return (
                            <div
                              key={ex.id}
                              className={`cal-exec-pill cal-exec-${v}`}
                              title={`${act?.name || ex.activityName} (${BRANCH_SHORT[ex.branch]})`}
                            >
                              <span className={`cal-exec-dot dot-${v}`} />
                              <span className="cal-note-text">
                                {act?.name || ex.activityName}
                              </span>
                            </div>
                          )
                        })}

                        {nonDailyExecs.length > 2 && (
                          <small className="cal-more">
                            +{nonDailyExecs.length - 2} más
                          </small>
                        )}
                        {nonDailyExecs.length === 0 && dailyCount > 0 && (
                          <small className="cal-more">{dailyCount} diaria(s)</small>
                        )}
                        {dayNotes.length > 0 && (
                          <small className="cal-more">{dayNotes.length} nota(s)</small>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Panel del día seleccionado */}
            <SelectedDayPanel
              selectedDate={selectedCalDate}
              today={today}
              currentUser={currentUser}
              executions={monthExecutions.filter(
                e =>
                  e.dueDate === selectedCalDate ||
                  (e.windowStart &&
                    e.windowStart <= selectedCalDate &&
                    selectedCalDate <= e.dueDate &&
                    !actMap.get(e.activityId)?.flexible)
              )}
              events={monthEvents.filter(ev => ev.date === selectedCalDate)}
              notes={notes.filter(
                n => n.status !== 'ARCHIVADO' && n.date === selectedCalDate
              )}
              actMap={actMap}
              onChangeStatus={onChangeStatus}
              onChangeExecutor={onChangeExecutor}
              onRescheduleExecution={onRescheduleExecution}
              onSaveObservation={onSaveObservation}
              onSelectExecution={onSelectExecution}
              onSelectNote={onSelectNote}
              onOpenEvents={onOpenEvents}
              onOpenNewActivity={onOpenNewActivity}
            />
          </div>
        </div>
      )}

      {/* MODAL DE IMPORTACIÓN MASIVA */}
      {importOpen && (
        <ImportModal
          existingActivities={activities}
          currentUser={currentUser}
          onImport={acts => {
            onImportActivities(acts)
            setImportOpen(false)
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </section>
  )
}

/** Fila compacta para resolver acumulaciones de actividades diarias vencidas sin borrar historial. */
function DailyBacklogRow({
  group,
  onResolveAll
}: {
  group: DailyBacklogGroup
  onResolveAll: (status: ExecStatus, reason?: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="daily-backlog-row">
      <div className="daily-backlog-main">
        <div className="daily-backlog-info">
          <b>{group.activityName}</b>
          <span className={`branch-pill branch-${group.branch.toLowerCase()}`}>
            {BRANCH_LABEL[group.branch]}
          </span>
          <span className="backlog-count-badge">
            {group.items.length} días anteriores sin registrar (
            {shortDate(group.items[0].dueDate)} al{' '}
            {shortDate(group.items[group.items.length - 1].dueDate)})
          </span>
        </div>
        <div className="daily-backlog-actions">
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={() => onResolveAll('NO_REALIZADA', 'Cierre de días atrasados')}
            title="Marcar los días anteriores como No realizados conservando el historial"
          >
            <Ban size={12} /> Cerrar atraso como No realizado
          </button>
          <button
            type="button"
            className="btn-success-sm"
            onClick={() => onResolveAll('REALIZADA')}
            title="Marcar todos como realizados"
          >
            <Check size={12} /> Marcar realizados
          </button>
          <button
            type="button"
            className="btn-exec-icon"
            onClick={() => setExpanded(e => !e)}
            title="Ver fechas"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="daily-backlog-dates">
          {group.items.map(i => (
            <span key={i.id} className="backlog-date-chip">
              {shortDate(i.dueDate)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SelectedDayPanel({
  selectedDate,
  today,
  currentUser,
  executions,
  events,
  notes,
  actMap,
  onChangeStatus,
  onChangeExecutor,
  onRescheduleExecution,
  onSaveObservation,
  onSelectExecution,
  onSelectNote,
  onOpenEvents,
  onOpenNewActivity
}: {
  selectedDate: string
  today: string
  currentUser: Role
  executions: Execution[]
  events: PlannerEvent[]
  notes: Note[]
  actMap: Map<string, Activity>
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onRescheduleExecution: (ex: Execution, newDate: string) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelectExecution: (ex: Execution) => void
  onSelectNote: (n: Note) => void
  onOpenEvents: () => void
  onOpenNewActivity: (prefill?: Partial<Activity>) => void
}) {
  return (
    <div className="cal-day-drawer month-side-panel">
      <div className="exec-group-header">
        <h2>{longDate(selectedDate)}</h2>
        <button
          type="button"
          className="btn-secondary-sm"
          onClick={() => onOpenNewActivity({ startDate: selectedDate, frequency: 'UNICA' })}
        >
          <Plus size={12} /> Actividad este día
        </button>
      </div>

      <div className="month-side-body">
        {events.map(ev => (
          <div key={ev.id} className="week-event-banner" onClick={onOpenEvents}>
            ★ {ev.title || eventTypeLabel(ev.type)} ({BRANCH_LABEL[ev.branch]})
          </div>
        ))}

        {executions.length === 0 && events.length === 0 && notes.length === 0 ? (
          <p className="week-day-empty">No hay actividades programadas para este día.</p>
        ) : (
          <div className="exec-group-list">
            {executions.map(ex => (
              <ExecutionRow
                key={ex.id}
                execution={ex}
                activity={actMap.get(ex.activityId)}
                today={today}
                currentUser={currentUser}
                compact={ex.status === 'REALIZADA'}
                onChangeStatus={onChangeStatus}
                onChangeExecutor={onChangeExecutor}
                onReschedule={onRescheduleExecution}
                onSaveObservation={onSaveObservation}
                onSelect={onSelectExecution}
              />
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div className="month-day-notes">
            <span className="detail-section-title">Notas de Pizarra</span>
            {notes.map(n => (
              <button
                type="button"
                key={n.id}
                className={`cal-note-pill ${n.color}`}
                onClick={() => onSelectNote(n)}
              >
                <span className="cal-note-dot" />
                <span className="cal-note-text">{n.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CatalogView({
  activities,
  onOpenNewActivity,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity,
  onDeleteActivity,
  onQuickCreateTemplate,
  onOpenImport,
  onClose
}: {
  activities: Activity[]
  onOpenNewActivity: (prefill?: Partial<Activity>) => void
  onEditActivity: (act: Activity) => void
  onDuplicateActivity: (act: Activity) => void
  onTogglePauseActivity: (act: Activity) => void
  onDeleteActivity: (act: Activity) => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
  onOpenImport: () => void
  onClose: () => void
}) {
  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <div>
          <h2>Catálogo de actividades configuradas ({activities.length})</h2>
          <p>Editá, pausá o reactivá reglas sin afectar el historial registrado.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenImport}
            title="Importar actividades masivamente desde archivo JSON"
          >
            <Upload size={14} />
            <span>Importar actividades</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Volver a Agenda
          </button>
          <button
            type="button"
            className="btn-new-note"
            onClick={() => onOpenNewActivity()}
          >
            <Plus size={16} strokeWidth={2.4} />
            <span>+ Nueva actividad</span>
          </button>
        </div>
      </div>

      {activities.length === 0 ? (
        <OnboardingEmpty
          onOpenNewActivity={onOpenNewActivity}
          onQuickCreateTemplate={onQuickCreateTemplate}
          onOpenImport={onOpenImport}
        />
      ) : (
        <div className="catalog-list">
          {activities.map(act => (
            <div
              key={act.id}
              className={`catalog-item ${act.state === 'PAUSADA' ? 'is-paused' : ''}`}
            >
              <div className="catalog-item-main">
                <div className="catalog-title-row">
                  <b>{act.name}</b>
                  <span className="exec-period-tag">{describeRule(act)}</span>
                  <span className={`branch-pill branch-${act.branch.toLowerCase()}`}>
                    {BRANCH_LABEL[act.branch]}
                  </span>
                  <span className="role-pill">Hab: {ROLE_LABEL[act.responsible]}</span>
                  {act.state === 'PAUSADA' && <span className="paused-badge">Pausada</span>}
                </div>
              </div>
              <div className="catalog-item-actions">
                <button
                  type="button"
                  className="btn-exec-action"
                  onClick={() => onEditActivity(act)}
                >
                  <Edit3 size={13} /> Editar
                </button>
                <button
                  type="button"
                  className="btn-exec-action"
                  onClick={() => onDuplicateActivity(act)}
                >
                  <Copy size={13} /> Duplicar
                </button>
                <button
                  type="button"
                  className="btn-exec-action"
                  onClick={() => onTogglePauseActivity(act)}
                >
                  {act.state === 'PAUSADA' ? (
                    <>
                      <PlayCircle size={13} /> Reactivar
                    </>
                  ) : (
                    <>
                      <PauseCircle size={13} /> Pausar
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn-exec-icon btn-exec-notdone"
                  onClick={() => {
                    if (
                      window.confirm(
                        '¿Desactivar esta actividad? El historial realizado se conservará.'
                      )
                    ) {
                      onDeleteActivity(act)
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OnboardingEmpty({
  onOpenNewActivity,
  onQuickCreateTemplate,
  onOpenImport
}: {
  onOpenNewActivity: (prefill?: Partial<Activity>) => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
  onOpenImport: () => void
}) {
  return (
    <div className="planner-onboarding">
      <div className="onboarding-head">
        <h2>Tu Agenda de Calidad está lista</h2>
        <p>
          Agregá tus actividades habituales con <b>+ Nueva actividad</b> o cargá tu catálogo completo:
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <button
            type="button"
            className="btn-new-note"
            onClick={() => onOpenNewActivity()}
          >
            <Plus size={16} strokeWidth={2.4} />
            <span>+ Nueva actividad</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenImport}
            title="Importar catálogo desde archivo JSON"
          >
            <Upload size={14} />
            <span>Importar actividades</span>
          </button>
        </div>
      </div>

      <div className="onboarding-templates">
        <div className="onboarding-templates-title">
          <Sparkles size={15} />
          <span>Ejemplos rápidos de Calidad (clic para agregar)</span>
        </div>
        <div className="onboarding-grid">
          {SUGGESTED_TEMPLATES.slice(0, 8).map(t => (
            <div className="onboarding-card" key={t.name}>
              <div className="onboarding-card-info">
                <b>{t.name}</b>
                <small>
                  {FREQ_LABEL[t.frequency]} · {BRANCH_LABEL[t.branch]} · {ROLE_LABEL[t.responsible]}
                </small>
              </div>
              <button
                type="button"
                className="btn-add-suggested"
                onClick={() => onQuickCreateTemplate(t)}
              >
                + Agregar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

