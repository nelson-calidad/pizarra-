import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, CalendarClock, SlidersHorizontal,
  Check, Ban, ChevronDown, ChevronUp, Edit3, Copy, PauseCircle, PlayCircle,
  Trash2, Sparkles, CheckCircle2, Upload, Search, X, MoreVertical, RotateCcw
} from 'lucide-react'
import type {
  Activity, AgendaView, BranchScope, Execution, ExecStatus, Frequency, Note, PlannerEvent, Role
} from '../types'
import {
  addDays, capitalize, daysInMonth, endOfMonth, fromParts, longDate,
  monthLabel, parseISO, shortDate, weekday, weekdayName, isValidISO, weekdayNameByIndex,
  isWeekend
} from '../lib/dates'
import {
  BRANCH_LABEL, eventTypeLabel, FREQ_LABEL, ROLE_LABEL
} from '../lib/labels'
import {
  buildExecutions, buildTodayView, buildWeekView, buildBacklogView,
  groupExecutionsByActivity, matchesFilter,
  type DailyBacklogGroup
} from '../lib/planner'
import { ExecutionRow } from './ExecutionRow'
import { GroupedExecutionCard } from './GroupedExecutionCard'
import { ImportModal } from './ImportModal'
import { SUGGESTED_TEMPLATES, type ActivityTemplate } from '../lib/templates'

type Props = {
  activities: Activity[]
  persistedExecutions: Execution[]
  events: PlannerEvent[]
  notes: Note[]
  today: string
  currentUser: Role
  personFilter?: Role | 'TODOS'
  onPersonFilterChange?: (p: Role | 'TODOS') => void
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
  onRestoreActivity?: (act: Activity) => void
  onOpenEvents: () => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
  onImportActivities: (acts: Activity[]) => void
  isLoading?: boolean
}

export function AgendaSection({
  activities,
  persistedExecutions,
  events,
  notes,
  today,
  currentUser,
  personFilter = 'TODOS',
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
  onRestoreActivity,
  onOpenEvents,
  onQuickCreateTemplate,
  onImportActivities,
  isLoading = false
}: Props) {
  // Vista inicial de Agenda: HOY (Punto 3)
  const [agendaView, setAgendaView] = useState<AgendaView>('today')
  const [showCatalog, setShowCatalog] = useState(false)
  const [showCompletedToday, setShowCompletedToday] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<string, boolean>>({})

  const toggleBucket = (name: string) => {
    setCollapsedBuckets(prev => ({ ...prev, [name]: !prev[name] }))
  }

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

  const groupedTodayTasks = useMemo(
    () => groupExecutionsByActivity(todayModel.todayTasks, actMap),
    [todayModel.todayTasks, actMap]
  )

  const pendingFulfillmentsToday = useMemo(
    () =>
      todayModel.todayTasks.filter(
        e => e.status !== 'REALIZADA' && e.status !== 'NO_REALIZADA'
      ).length,
    [todayModel.todayTasks]
  )

  // Agrupación visual inteligente por categorías cuando hay muchas actividades (> 6)
  const todayCategoryBuckets = useMemo(() => {
    if (groupedTodayTasks.length <= 6) return null

    const BUCKETS = [
      'Indicadores y encuestas',
      'Reclamos y seguimiento',
      'Controles y auditorías',
      'Comunicaciones y reuniones',
      'General y procesos'
    ]

    const map = new Map<string, typeof groupedTodayTasks>()
    for (const b of BUCKETS) map.set(b, [])

    for (const g of groupedTodayTasks) {
      const cat = (g.activity?.category || '').toLowerCase()
      const name = (g.activityName || '').toLowerCase()

      let target = 'General y procesos'
      if (
        cat.includes('indicador') ||
        cat.includes('encuesta') ||
        name.includes('indicador') ||
        name.includes('ipsos') ||
        name.includes('encuesta') ||
        name.includes('cem') ||
        name.includes('ssi') ||
        name.includes('csi')
      ) {
        target = 'Indicadores y encuestas'
      } else if (
        cat.includes('reclamo') ||
        name.includes('reclamo') ||
        name.includes('hot alert') ||
        name.includes('seguimiento')
      ) {
        target = 'Reclamos y seguimiento'
      } else if (
        cat.includes('auditor') ||
        cat.includes('control') ||
        cat.includes('taller') ||
        name.includes('control') ||
        name.includes('auditor') ||
        name.includes('pcgc') ||
        name.includes('iso') ||
        name.includes('taller') ||
        name.includes('recorrida')
      ) {
        target = 'Controles y auditorías'
      } else if (
        cat.includes('comunic') ||
        cat.includes('reun') ||
        name.includes('comunic') ||
        name.includes('whatsapp') ||
        name.includes('reunión') ||
        name.includes('reunion') ||
        name.includes('informe') ||
        name.includes('devolución')
      ) {
        target = 'Comunicaciones y reuniones'
      }

      if (!map.has(target)) map.set(target, [])
      map.get(target)!.push(g)
    }

    return Array.from(map.entries())
      .filter(([, items]) => items.length > 0)
      .map(([name, items]) => {
        const totalActivities = items.length
        const totalFulfillments = items.reduce((acc, g) => acc + g.items.length, 0)
        const pendingCount = items.reduce(
          (acc, g) =>
            acc +
            g.items.filter(e => e.status !== 'REALIZADA' && e.status !== 'NO_REALIZADA').length,
          0
        )
        return { name, items, totalActivities, totalFulfillments, pendingCount }
      })
  }, [groupedTodayTasks])

  const groupedFlexibleSoon = useMemo(
    () => groupExecutionsByActivity(todayModel.flexibleSoon, actMap),
    [todayModel.flexibleSoon, actMap]
  )

  const groupedCompletedToday = useMemo(
    () => groupExecutionsByActivity(todayModel.completedToday, actMap),
    [todayModel.completedToday, actMap]
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

  // ---- Modelo ANTERIORES ----
  const backlogModel = useMemo(
    () => buildBacklogView(activities, persistedExecutions, events, today, filter),
    [activities, persistedExecutions, events, today, filter]
  )

  const groupedBacklogTasks = useMemo(
    () => groupExecutionsByActivity(backlogModel.overdueTasks, actMap),
    [backlogModel.overdueTasks, actMap]
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

  return (
    <section className="agenda-page">
      {/* Barra superior minimalista: Hoy / Semana / Mes / Anteriores + Filtro opcional por sucursal */}
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
            {pendingFulfillmentsToday > 0 && <em className="tab-pill">{pendingFulfillmentsToday}</em>}
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

          <button
            type="button"
            role="tab"
            aria-selected={agendaView === 'backlog' && !showCatalog}
            className={`agenda-tab-btn ${agendaView === 'backlog' && !showCatalog ? 'active' : ''}`}
            onClick={() => {
              setShowCatalog(false)
              setAgendaView('backlog')
            }}
            title="Compromisos de períodos pasados que aún no se registraron"
          >
            <span>Anteriores</span>
            {backlogModel.totalCount > 0 && (
              <em className="tab-pill tone-muted" style={{ background: 'var(--color-bg-subtle, #cbd5e1)', color: '#334155' }}>
                {backlogModel.totalCount}
              </em>
            )}
          </button>
        </div>

        {/* Filtro único y opcional por sucursal (Todas | Jujuy | Salta) */}
        <div className="agenda-filters">
          <div className="segmented-control segmented-xs" aria-label="Filtro por sucursal">
            <button
              type="button"
              className={branchFilter === 'TODAS' ? 'active' : ''}
              onClick={() => onBranchFilterChange('TODAS')}
            >
              Todas
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
          activities={activities}
          onOpenNewActivity={onOpenNewActivity}
          onEditActivity={onEditActivity}
          onDuplicateActivity={onDuplicateActivity}
          onTogglePauseActivity={onTogglePauseActivity}
          onDeleteActivity={onDeleteActivity}
          onRestoreActivity={onRestoreActivity}
          onQuickCreateTemplate={onQuickCreateTemplate}
          onOpenImport={() => setImportOpen(true)}
          onClose={() => setShowCatalog(false)}
        />
      ) : isLoading && activeActivities.length === 0 ? (
        <div className="agenda-loading-screen" role="status" aria-live="polite">
          <div className="agenda-loading-card">
            <div className="spinner-subtle" />
            <span className="agenda-loading-title">Cargando actividades…</span>
            <span className="agenda-loading-sub">Sincronizando con Google Sheets</span>
          </div>
        </div>
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
                {pendingFulfillmentsToday === 0
                  ? 'Todo al día.'
                  : `${pendingFulfillmentsToday} ${
                      pendingFulfillmentsToday === 1
                        ? 'cumplimiento pendiente'
                        : 'cumplimientos pendientes'
                    }`}
                {todayModel.completedToday.length > 0 &&
                  ` · ${todayModel.completedToday.length} realizado${
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

          {/* Actividades para hoy (diarias, semanales de hoy, o en ventana activa del 7 al 10) */}
          <div className="exec-group">
            <div className="exec-group-header">
              <h2>Para hacer hoy</h2>
              <span className="group-count-pill tone-neutral">
                {pendingFulfillmentsToday} {pendingFulfillmentsToday === 1 ? 'pendiente' : 'pendientes'}
              </span>
            </div>
            {todayModel.todayTasks.length === 0 ? (
              <div className="today-done-banner">
                <CheckCircle2 size={20} />
                <span>No quedan cumplimientos pendientes programados para hoy.</span>
              </div>
            ) : todayCategoryBuckets ? (
              <div className="today-categorized-list">
                {todayCategoryBuckets.map(bucket => {
                  const isCollapsed = !!collapsedBuckets[bucket.name]
                  return (
                    <div key={bucket.name} className={`today-cat-block ${isCollapsed ? 'is-collapsed' : ''}`}>
                      <div
                        className="today-cat-header clickable"
                        onClick={() => toggleBucket(bucket.name)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBucket(bucket.name) } }}
                      >
                        <div className="today-cat-header-left">
                          <span className="today-cat-chevron">
                            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                          </span>
                          <span className="today-cat-title">{bucket.name}</span>
                        </div>
                        <div className="today-cat-header-right">
                          <span className="today-cat-counts">
                            {bucket.totalActivities} {bucket.totalActivities === 1 ? 'actividad' : 'actividades'} · {bucket.totalFulfillments} {bucket.totalFulfillments === 1 ? 'cumplimiento' : 'cumplimientos'}
                          </span>
                          <span className={`today-cat-count-badge ${bucket.pendingCount > 0 ? 'is-pending' : 'is-done'}`}>
                            {bucket.pendingCount > 0
                              ? `${bucket.pendingCount} ${bucket.pendingCount === 1 ? 'pendiente' : 'pendientes'}`
                              : 'Al día'}
                          </span>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div className="exec-group-list">
                          {bucket.items.map(group => (
                            <GroupedExecutionCard
                              key={group.activityId}
                              group={group}
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
                  )
                })}
              </div>
            ) : (
              <div className="exec-group-list">
                {groupedTodayTasks.map(group => (
                  <GroupedExecutionCard
                    key={group.activityId}
                    group={group}
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
                {groupedFlexibleSoon.map(group => (
                  <GroupedExecutionCard
                    key={group.activityId}
                    group={group}
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
                  {groupedCompletedToday.map(group => (
                    <GroupedExecutionCard
                      key={group.activityId}
                      group={group}
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

          {/* Vencidas no resueltas de la semana */}
          {weekModel.overdueWeek && weekModel.overdueWeek.length > 0 && (
            <div className="exec-group group-overdue week-flexibles-box">
              <div className="exec-group-header">
                <h2>Vencidas pendientes de la semana</h2>
                <span className="group-count-pill tone-danger">
                  {weekModel.overdueWeek.length}
                </span>
              </div>
              <div className="exec-group-list">
                {weekModel.overdueWeek.map(ex => (
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

          {/* Semanales flexibles sin día rígido */}
          {((weekModel.flexibleWeekly && weekModel.flexibleWeekly.length > 0) ||
            (!weekModel.flexibleWeekly && weekModel.flexibleWeek.length > 0)) && (
            <div className="exec-group week-flexibles-box">
              <div className="exec-group-header">
                <h2>Flexibles de la semana</h2>
                <span className="group-count-pill tone-info">
                  {(weekModel.flexibleWeekly || weekModel.flexibleWeek).filter(
                    e => e.status !== 'REALIZADA'
                  ).length}{' '}
                  pendientes
                </span>
              </div>
              <div className="exec-group-list">
                {(weekModel.flexibleWeekly || weekModel.flexibleWeek).map(ex => (
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

          {/* Ventanas mensuales abiertas durante la semana */}
          {weekModel.monthWindows && weekModel.monthWindows.length > 0 && (
            <div className="exec-group week-flexibles-box">
              <div className="exec-group-header">
                <h2>Ventanas mensuales activas</h2>
                <span className="group-count-pill tone-neutral">
                  {weekModel.monthWindows.filter(e => e.status !== 'REALIZADA').length} pendientes
                </span>
              </div>
              <div className="exec-group-list">
                {weekModel.monthWindows.map(ex => (
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
              if (day.items.length === 0 && dayEvents.length === 0) {
                return (
                  <div
                    key={day.date}
                    className={`week-day-card is-empty-compact ${day.isToday ? 'is-today' : ''}`}
                  >
                    <span className="week-day-label">
                      {capitalize(weekdayName(day.date))} {shortDate(day.date)}
                      {day.isToday && <em className="today-pill-badge" style={{ marginLeft: 6 }}>HOY</em>}
                    </span>
                    <small className="weekend-quiet">Sin actividades programadas</small>
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
      ) : agendaView === 'month' ? (
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
                  const isWknd = isWeekend(ds)

                  // En las celdas del mes: si es fin de semana, excluimos actividades exclusivas
                  // de días hábiles (businessDaysOnly) no realizadas para no generar falsas obligaciones.
                  const dayAllExecs = monthExecutions.filter(e => {
                    const act = actMap.get(e.activityId)
                    if (isWknd && act?.businessDaysOnly && e.status !== 'REALIZADA') {
                      return false
                    }
                    return (
                      e.dueDate === ds ||
                      (e.windowStart && e.windowStart <= ds && ds <= e.dueDate && !act?.flexible)
                    )
                  })

                  const dayEvents = monthEvents.filter(ev => ev.date === ds)
                  const dayNotes = notes.filter(
                    n => n.status !== 'ARCHIVADO' && n.date === ds
                  )

                  // Vencidas reales (únicamente si la fecha límite es anterior a hoy y aún no se cumplió)
                  const realOverdueCount = dayAllExecs.filter(
                    e => e.dueDate < today && e.status !== 'REALIZADA' && e.status !== 'NO_REALIZADA'
                  ).length

                  const allDone =
                    dayAllExecs.length > 0 &&
                    dayAllExecs.every(e => e.status === 'REALIZADA')

                  const pendingCount = dayAllExecs.filter(
                    e => e.status !== 'REALIZADA' && e.status !== 'NO_REALIZADA'
                  ).length

                  const nonDailyPending = dayAllExecs.filter(
                    e => actMap.get(e.activityId)?.frequency !== 'DIARIA' && e.status !== 'REALIZADA'
                  )

                  return (
                    <div
                      key={day}
                      className={`cal-cell ${ds === today ? 'now' : ''} ${
                        ds === selectedCalDate ? 'cal-cell-selected' : ''
                      } ${isWknd ? 'cal-cell-weekend' : ''}`}
                      onClick={() => setSelectedCalDate(ds)}
                    >
                      <div className="cell-header">
                        <span className="cell-num">{day}</span>
                        <div className="cell-dots-indicator">
                          {realOverdueCount > 0 && (
                            <span className="mini-dot dot-overdue" title={`${realOverdueCount} vencida(s) real(es)`}>
                              !
                            </span>
                          )}
                          {allDone && (
                            <span className="mini-dot dot-done" title="Todo realizado">
                              ✓
                            </span>
                          )}
                          {pendingCount > 0 && realOverdueCount === 0 && (
                            <span className="cell-count-tag" title={`${pendingCount} pendiente(s)`}>
                              {pendingCount}
                            </span>
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

                        {realOverdueCount > 0 ? (
                          <div className="cal-cell-chip chip-overdue" title={`${realOverdueCount} actividad(es) vencida(s)`}>
                            <span className="chip-dot dot-overdue" />
                            <span>{realOverdueCount} {realOverdueCount === 1 ? 'vencida' : 'vencidas'}</span>
                          </div>
                        ) : allDone ? (
                          <div className="cal-cell-chip chip-done" title="Todas las actividades realizadas">
                            <span className="chip-dot dot-done" />
                            <span>Al día</span>
                          </div>
                        ) : nonDailyPending.length > 0 ? (
                          <>
                            <div
                              className="cal-cell-chip chip-pending"
                              title={actMap.get(nonDailyPending[0].activityId)?.name || nonDailyPending[0].activityName}
                            >
                              <span className="chip-dot dot-pending" />
                              <span className="chip-text">
                                {actMap.get(nonDailyPending[0].activityId)?.name || nonDailyPending[0].activityName}
                              </span>
                            </div>
                            {dayAllExecs.length > 1 && (
                              <small className="cal-more">+{dayAllExecs.length - 1} más</small>
                            )}
                          </>
                        ) : pendingCount > 0 ? (
                          <div className="cal-cell-chip chip-pending">
                            <span className="chip-dot dot-pending" />
                            <span>{pendingCount} {pendingCount === 1 ? 'actividad' : 'actividades'}</span>
                          </div>
                        ) : null}

                        {dayNotes.length > 0 && (
                          <small className="cal-more cal-more-notes">
                            {dayNotes.length} {dayNotes.length === 1 ? 'nota' : 'notas'}
                          </small>
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
              executions={monthExecutions.filter(e => {
                const act = actMap.get(e.activityId)
                if (isWeekend(selectedCalDate) && act?.businessDaysOnly && e.status !== 'REALIZADA') {
                  return false
                }
                return (
                  e.dueDate === selectedCalDate ||
                  (e.windowStart &&
                    e.windowStart <= selectedCalDate &&
                    selectedCalDate <= e.dueDate &&
                    !act?.flexible)
                )
              })}
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
              onEditActivity={onEditActivity}
              onDuplicateActivity={onDuplicateActivity}
              onTogglePauseActivity={onTogglePauseActivity}
            />
          </div>
        </div>
      ) : (
        /* =========================================================
           VISTA 4: ANTERIORES (Compromisos vencidos no registrados)
           ========================================================= */
        <div className="backlog-container">
          <div className="today-header-line" style={{ marginBottom: 16 }}>
            <div>
              <h1 className="today-title">Actividades de períodos anteriores</h1>
              <p className="today-sub">
                {backlogModel.totalCount === 0
                  ? 'No hay actividades anteriores pendientes de registro.'
                  : `${backlogModel.totalCount} ${
                      backlogModel.totalCount === 1 ? 'fecha pendiente' : 'fechas pendientes'
                    } de registro`}
              </p>
            </div>
          </div>

          {backlogModel.totalCount === 0 ? (
            <div className="today-done-banner">
              <CheckCircle2 size={20} />
              <span>Todo al día. No tenés compromisos anteriores sin registrar.</span>
            </div>
          ) : (
            <div className="exec-group-list">
              {/* Acumulaciones compactas de actividades diarias */}
              {backlogModel.dailyBacklog.map(bg => (
                <DailyBacklogRow
                  key={`${bg.activityId}__${bg.branch}`}
                  group={bg}
                  onResolveAll={(status, reason) =>
                    onBatchResolveBacklog(bg.items, status, reason)
                  }
                />
              ))}

              {/* Tareas no diarias agrupadas por actividad */}
              {groupedBacklogTasks.map(group => (
                <GroupedExecutionCard
                  key={group.activityId}
                  group={group}
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
  onOpenNewActivity,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity
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
  onEditActivity?: (act: Activity) => void
  onDuplicateActivity?: (act: Activity) => void
  onTogglePauseActivity?: (act: Activity) => void
}) {
  const groupedExecs = useMemo(
    () => groupExecutionsByActivity(executions, actMap),
    [executions, actMap]
  )

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

        {groupedExecs.length === 0 && events.length === 0 && notes.length === 0 ? (
          <p className="week-day-empty">No hay actividades programadas para este día.</p>
        ) : (
          <div className="exec-group-list">
            {groupedExecs.map(group => (
              <GroupedExecutionCard
                key={group.key}
                group={group}
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

function getCatalogSecondaryInfo(act: Activity): string {
  const parts: string[] = []

  // Frecuencia
  const freqLabel =
    act.frequency === 'EVENTO'
      ? 'Por evento'
      : act.frequency === 'UNICA'
      ? 'Puntual'
      : FREQ_LABEL[act.frequency] || act.frequency
  parts.push(freqLabel)

  // Regla
  if (act.frequency === 'DIARIA') {
    parts.push(act.businessDaysOnly ? 'Días hábiles' : 'Todos los días')
  } else if (act.frequency === 'SEMANAL') {
    if (isValidISO(act.startDate)) {
      const wName = capitalize(weekdayNameByIndex(weekday(act.startDate)))
      parts.push(act.flexible ? `Flexible (vence ${wName})` : wName)
    }
  } else if (['MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].includes(act.frequency)) {
    if (act.windowStartDay && act.windowEndDay && act.windowEndDay >= act.windowStartDay) {
      parts.push(`Del ${act.windowStartDay} al ${act.windowEndDay}`)
    } else if (isValidISO(act.startDate)) {
      const { d } = parseISO(act.startDate)
      parts.push(d >= 29 ? 'Día 31 (o último)' : `Día ${d}`)
    }
  } else if (act.frequency === 'EVENTO') {
    if (act.eventType && !act.name.toUpperCase().includes(act.eventType.toUpperCase())) {
      parts.push(eventTypeLabel(act.eventType))
    }
  } else if (act.frequency === 'UNICA') {
    if (isValidISO(act.startDate)) {
      parts.push(shortDate(act.startDate))
    }
  }

  // Sucursal
  const branchText =
    act.branch === 'AMBAS'
      ? 'Jujuy y Salta'
      : act.branch === 'JUJUY'
      ? 'Jujuy'
      : act.branch === 'SALTA'
      ? 'Salta'
      : 'General'
  parts.push(branchText)

  return parts.filter(Boolean).join(' · ')
}

const FREQUENCY_ORDER: { freq: Frequency; label: string }[] = [
  { freq: 'DIARIA', label: 'Diarias' },
  { freq: 'SEMANAL', label: 'Semanales' },
  { freq: 'MENSUAL', label: 'Mensuales' },
  { freq: 'TRIMESTRAL', label: 'Trimestrales' },
  { freq: 'SEMESTRAL', label: 'Semestrales' },
  { freq: 'ANUAL', label: 'Anuales' },
  { freq: 'EVENTO', label: 'Por evento' },
  { freq: 'UNICA', label: 'Puntuales' }
]

function CatalogView({
  activities,
  onOpenNewActivity,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity,
  onDeleteActivity,
  onRestoreActivity,
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
  onRestoreActivity?: (act: Activity) => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
  onOpenImport: () => void
  onClose: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'ACTIVAS' | 'PAUSADAS' | 'TODAS' | 'ELIMINADAS'>('ACTIVAS')
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // Conteos reales sobre actividades maestras
  const masterActivities = useMemo(
    () => activities.filter(a => a.state !== 'INACTIVA'),
    [activities]
  )
  const totalMaster = masterActivities.length
  const activeMaster = useMemo(
    () => masterActivities.filter(a => a.state === 'ACTIVA').length,
    [masterActivities]
  )
  const pausedMaster = useMemo(
    () => masterActivities.filter(a => a.state === 'PAUSADA').length,
    [masterActivities]
  )
  const deletedMaster = useMemo(
    () => activities.filter(a => a.state === 'INACTIVA').length,
    [activities]
  )

  // Base filtrada por pestaña
  const baseActivities = useMemo(() => {
    if (filterTab === 'ACTIVAS') return masterActivities.filter(a => a.state === 'ACTIVA')
    if (filterTab === 'PAUSADAS') return masterActivities.filter(a => a.state === 'PAUSADA')
    if (filterTab === 'TODAS') return masterActivities
    return activities.filter(a => a.state === 'INACTIVA')
  }, [filterTab, masterActivities, activities])

  // Filtrado instantáneo por búsqueda
  const normalizedQuery = useMemo(
    () => searchQuery.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    [searchQuery]
  )

  const isSearching = normalizedQuery.length > 0

  const filteredActivities = useMemo(() => {
    if (!isSearching) return baseActivities
    const norm = (s?: string) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return baseActivities.filter(act => {
      const sec = norm(getCatalogSecondaryInfo(act))
      return (
        norm(act.name).includes(normalizedQuery) ||
        norm(act.description).includes(normalizedQuery) ||
        norm(act.category).includes(normalizedQuery) ||
        norm(act.eventType).includes(normalizedQuery) ||
        sec.includes(normalizedQuery)
      )
    })
  }, [baseActivities, isSearching, normalizedQuery])

  // Agrupación dinámica por frecuencia
  const groupedSections = useMemo(() => {
    const map = new Map<string, Activity[]>()
    for (const a of filteredActivities) {
      const f = a.frequency || 'UNICA'
      const list = map.get(f) || []
      list.push(a)
      map.set(f, list)
    }

    const sections: { freq: Frequency; label: string; items: Activity[] }[] = []
    const seen = new Set<string>()

    for (const { freq, label } of FREQUENCY_ORDER) {
      const items = map.get(freq)
      if (items && items.length > 0) {
        sections.push({ freq, label, items })
        seen.add(freq)
      }
    }

    // Cualquier frecuencia adicional no prevista
    for (const [f, items] of map.entries()) {
      if (!seen.has(f) && items.length > 0) {
        sections.push({
          freq: f as Frequency,
          label: capitalize(f.toLowerCase()),
          items
        })
      }
    }

    return sections
  }, [filteredActivities])

  const toggleGroup = (freq: string) => {
    setOpenGroup(curr => (curr === freq ? null : freq))
  }

  return (
    <div className="catalog-container">
      {/* Header */}
      <div className="catalog-header-top">
        <div className="catalog-header-info">
          <h2>Mis actividades</h2>
          <div className="catalog-counts-summary">
            <span>
              {totalMaster} {totalMaster === 1 ? 'actividad' : 'actividades'} · {activeMaster} {activeMaster === 1 ? 'activa' : 'activas'} · {pausedMaster} {pausedMaster === 1 ? 'pausada' : 'pausadas'}
            </span>
          </div>
        </div>

        <div className="catalog-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenImport}
            title="Importar actividades masivamente desde archivo JSON"
          >
            <Upload size={14} />
            <span>Importar</span>
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

      {/* Barra de herramientas: Buscador y Filtros */}
      <div className="catalog-toolbar">
        <div className="catalog-search-wrap">
          <Search size={15} className="catalog-search-icon" />
          <input
            type="text"
            className="catalog-search-input"
            placeholder="Buscar actividad por nombre, categoría o palabra clave…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="catalog-search-clear"
              onClick={() => setSearchQuery('')}
              title="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="catalog-filter-tabs">
          <button
            type="button"
            className={`catalog-filter-tab ${filterTab === 'ACTIVAS' ? 'active' : ''}`}
            onClick={() => setFilterTab('ACTIVAS')}
          >
            Activas ({activeMaster})
          </button>
          <button
            type="button"
            className={`catalog-filter-tab ${filterTab === 'PAUSADAS' ? 'active' : ''}`}
            onClick={() => setFilterTab('PAUSADAS')}
          >
            Pausadas ({pausedMaster})
          </button>
          <button
            type="button"
            className={`catalog-filter-tab ${filterTab === 'TODAS' ? 'active' : ''}`}
            onClick={() => setFilterTab('TODAS')}
          >
            Todas ({totalMaster})
          </button>
          {deletedMaster > 0 && (
            <button
              type="button"
              className={`catalog-filter-tab tab-danger ${filterTab === 'ELIMINADAS' ? 'active' : ''}`}
              onClick={() => setFilterTab('ELIMINADAS')}
            >
              Eliminadas ({deletedMaster})
            </button>
          )}
        </div>
      </div>

      {/* Contenido: Listado agrupado con acordeón */}
      {masterActivities.length === 0 && filterTab !== 'ELIMINADAS' ? (
        <OnboardingEmpty
          onOpenNewActivity={onOpenNewActivity}
          onQuickCreateTemplate={onQuickCreateTemplate}
          onOpenImport={onOpenImport}
        />
      ) : filteredActivities.length === 0 ? (
        <div className="planner-empty-box" style={{ padding: '36px 16px' }}>
          <p>
            {isSearching
              ? `No se encontraron actividades que coincidan con «${searchQuery}».`
              : filterTab === 'ELIMINADAS'
              ? 'No hay actividades eliminadas en la papelera.'
              : filterTab === 'PAUSADAS'
              ? 'No hay actividades pausadas actualmente.'
              : 'No hay actividades en esta vista.'}
          </p>
          {isSearching && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSearchQuery('')}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div className="catalog-groups">
          {groupedSections.map(sec => {
            const isOpen = isSearching || openGroup === sec.freq
            return (
              <div
                key={sec.freq}
                className={`catalog-group-section ${isOpen ? 'is-open' : ''}`}
              >
                <button
                  type="button"
                  className="catalog-group-header"
                  onClick={() => toggleGroup(sec.freq)}
                  aria-expanded={isOpen}
                >
                  <div className="catalog-group-title-wrap">
                    <ChevronRight
                      size={16}
                      className={`catalog-group-chevron ${isOpen ? 'is-open' : ''}`}
                    />
                    <span>{sec.label}</span>
                    <span className="catalog-group-count">({sec.items.length})</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="catalog-group-items">
                    {sec.items.map(act => (
                      <div
                        key={act.id}
                        className={`catalog-compact-row ${act.state === 'PAUSADA' ? 'is-paused' : ''} ${act.state === 'INACTIVA' ? 'is-inactive' : ''}`}
                      >
                        <div className="catalog-compact-main">
                          <div className="catalog-compact-title">
                            <span>{act.name}</span>
                            {act.state === 'PAUSADA' && (
                              <span className="catalog-pill-paused">Pausada</span>
                            )}
                            {act.state === 'INACTIVA' && (
                              <span className="catalog-pill-deleted">Eliminada</span>
                            )}
                          </div>
                          <div className="catalog-compact-sub">
                            {getCatalogSecondaryInfo(act)}
                          </div>
                        </div>

                        <div className="catalog-compact-actions">
                          {act.state === 'INACTIVA' ? (
                            <button
                              type="button"
                              className="btn-catalog-restore"
                              onClick={() => onRestoreActivity?.(act)}
                              title="Restaurar actividad a la agenda"
                            >
                              <RotateCcw size={13} />
                              <span>Restaurar</span>
                            </button>
                          ) : (
                            <div className="catalog-menu-container">
                              <button
                                type="button"
                                className="btn-catalog-more"
                                onClick={() =>
                                  setActiveMenuId(activeMenuId === act.id ? null : act.id)
                                }
                                title="Opciones"
                                aria-label="Opciones de actividad"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {activeMenuId === act.id && (
                                <>
                                  <div
                                    className="catalog-menu-backdrop"
                                    onClick={() => setActiveMenuId(null)}
                                  />
                                  <div className="catalog-dropdown-menu">
                                    <button
                                      type="button"
                                      className="catalog-dropdown-item"
                                      onClick={() => {
                                        setActiveMenuId(null)
                                        onEditActivity(act)
                                      }}
                                    >
                                      <Edit3 size={13} />
                                      <span>Editar</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="catalog-dropdown-item"
                                      onClick={() => {
                                        setActiveMenuId(null)
                                        onDuplicateActivity(act)
                                      }}
                                    >
                                      <Copy size={13} />
                                      <span>Duplicar</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="catalog-dropdown-item"
                                      onClick={() => {
                                        setActiveMenuId(null)
                                        onTogglePauseActivity(act)
                                      }}
                                    >
                                      {act.state === 'PAUSADA' ? (
                                        <>
                                          <PlayCircle size={13} />
                                          <span>Reactivar</span>
                                        </>
                                      ) : (
                                        <>
                                          <PauseCircle size={13} />
                                          <span>Pausar</span>
                                        </>
                                      )}
                                    </button>
                                    <div className="catalog-dropdown-divider" />
                                    <button
                                      type="button"
                                      className="catalog-dropdown-item item-danger"
                                      onClick={() => {
                                        setActiveMenuId(null)
                                        if (
                                          window.confirm(
                                            '¿Eliminar esta actividad? Dejará de aparecer en la agenda. Su historial se conservará.'
                                          )
                                        ) {
                                          onDeleteActivity(act)
                                        }
                                      }}
                                    >
                                      <Trash2 size={13} />
                                      <span>Eliminar</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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

