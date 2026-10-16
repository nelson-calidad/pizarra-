import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react'
import type {
  Activity, BranchScope, Execution, ExecStatus, Note, PlannerEvent, Role
} from '../types'
import {
  daysInMonth, endOfMonth, fromParts, longDate, monthLabel, parseISO, weekday
} from '../lib/dates'
import { BRANCH_SHORT, eventTypeLabel, ROLE_LABEL } from '../lib/labels'
import {
  buildExecutions, leadDaysFor, matchesFilter, summarize, visualState
} from '../lib/planner'
import { ExecutionRow } from './ExecutionRow'

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
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelectExecution: (ex: Execution) => void
  onSelectNote: (n: Note) => void
  onOpenEvents: () => void
}

export function CalendarSection({
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
  onChangeExecutor,
  onSaveObservation,
  onSelectExecution,
  onSelectNote,
  onOpenEvents
}: Props) {
  const init = parseISO(today)
  const [year, setYear] = useState(init.y)
  const [month, setMonth] = useState(init.m)
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [showBoardNotes, setShowBoardNotes] = useState(true)

  const stepMonth = (dir: -1 | 1) => {
    const total = year * 12 + (month - 1) + dir
    setYear(Math.floor(total / 12))
    setMonth((total % 12) + 1)
  }

  const mStart = fromParts(year, month, 1)
  const mEnd = endOfMonth(mStart)
  const startDow = weekday(mStart) // 0=Dom..6=Sáb
  const totalDays = daysInMonth(year, month)

  const actMap = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities])

  const monthExecutions = useMemo(() => {
    const raw = buildExecutions(activities, persistedExecutions, events, mStart, mEnd)
    return raw.filter(e =>
      matchesFilter(
        e,
        { person: personFilter, branch: branchFilter, query },
        actMap.get(e.activityId),
        today
      )
    )
  }, [activities, persistedExecutions, events, mStart, mEnd, personFilter, branchFilter, query, actMap, today])

  const summary = useMemo(() => summarize(monthExecutions, today), [monthExecutions, today])

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

  const dayExecutions = useMemo(
    () => monthExecutions.filter(e => e.dueDate === selectedDate),
    [monthExecutions, selectedDate]
  )

  return (
    <section className="calendar-view">
      <div className="planner-top-card" style={{ marginBottom: 18 }}>
        <div className="planner-period-bar">
          <div className="period-nav-group">
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => stepMonth(-1)}
              title="Mes anterior"
            >
              <ChevronLeft size={17} />
            </button>
            <h1 className="period-heading">{monthLabel(mStart.slice(0, 7)).toUpperCase()}</h1>
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => stepMonth(1)}
              title="Mes siguiente"
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              className="btn-today-chip"
              onClick={() => {
                setYear(init.y)
                setMonth(init.m)
                setSelectedDate(today)
              }}
            >
              Hoy
            </button>
          </div>

          <div className="period-right-controls">
            <span className="stat-pill">{summary.previstas} previstas</span>
            <span className="stat-pill" style={{ color: 'var(--success)' }}>
              {summary.realizadas} realizadas
            </span>
            {summary.vencidas > 0 && (
              <span className="stat-pill stat-pill-danger">{summary.vencidas} vencidas</span>
            )}
            <button type="button" className="btn-events-trigger" onClick={onOpenEvents}>
              <CalendarClock size={15} />
              <span>Auditorías y cierres</span>
            </button>
          </div>
        </div>

        <div className="planner-filters-row">
          <div className="filter-group">
            <span className="filter-group-label">Persona:</span>
            <div className="segmented-control segmented-xs">
              <button
                type="button"
                className={personFilter === 'TODOS' ? 'active' : ''}
                onClick={() => onPersonFilterChange('TODOS')}
              >
                Ambos
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
          </div>

          <div className="filter-group">
            <span className="filter-group-label">Sucursal:</span>
            <div className="segmented-control segmented-xs">
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
          </div>

          <label className="checkbox-inline" style={{ marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={showBoardNotes}
              onChange={e => setShowBoardNotes(e.target.checked)}
            />
            <span>Mostrar también notas con fecha de la Pizarra</span>
          </label>
        </div>
      </div>

      <div className="calendar-container">
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
            const ds = fromParts(year, month, day)
            const dayExecs = monthExecutions.filter(e => e.dueDate === ds)
            const dayEvents = monthEvents.filter(ev => ev.date === ds)
            const dayNotes = showBoardNotes
              ? notes.filter(n => n.status !== 'ARCHIVADO' && n.date === ds)
              : []
            const totalCount = dayExecs.length + dayEvents.length + dayNotes.length

            return (
              <div
                className={`cal-cell ${ds === today ? 'now' : ''} ${
                  ds === selectedDate ? 'cal-cell-selected' : ''
                }`}
                key={day}
                onClick={() => setSelectedDate(ds)}
              >
                <div className="cell-header">
                  <span className="cell-num">{day}</span>
                  {totalCount > 0 && <span className="cell-count-tag">{totalCount}</span>}
                </div>
                <div className="cell-notes">
                  {dayEvents.map(ev => (
                    <button
                      type="button"
                      key={ev.id}
                      className="cal-event-pill"
                      onClick={e => {
                        e.stopPropagation()
                        onOpenEvents()
                      }}
                      title={`Evento: ${ev.title || eventTypeLabel(ev.type)}`}
                    >
                      <span>★ {ev.title || eventTypeLabel(ev.type)}</span>
                    </button>
                  ))}

                  {dayExecs.slice(0, 4).map(ex => {
                    const act = actMap.get(ex.activityId)
                    const v = visualState(ex, today, leadDaysFor(act))
                    return (
                      <button
                        type="button"
                        key={ex.id}
                        className={`cal-exec-pill cal-exec-${v}`}
                        onClick={e => {
                          e.stopPropagation()
                          onSelectExecution(ex)
                        }}
                        title={`${act?.name || ex.activityName} · ${BRANCH_SHORT[ex.branch]} · ${
                          ROLE_LABEL[ex.executor]
                        }`}
                      >
                        <span className={`cal-exec-dot dot-${v}`} />
                        <span className="cal-note-text">
                          {act?.name || ex.activityName}
                        </span>
                        <small className="cal-exec-meta">
                          {BRANCH_SHORT[ex.branch]}·{ex.executor === 'RAC' ? 'R' : 'A'}
                        </small>
                      </button>
                    )
                  })}

                  {dayNotes.slice(0, 2).map(n => (
                    <button
                      type="button"
                      className={`cal-note-pill ${n.color}`}
                      onClick={e => {
                        e.stopPropagation()
                        onSelectNote(n)
                      }}
                      key={n.id}
                      title={`Nota de pizarra: ${n.text}`}
                    >
                      <span className="cal-note-dot" />
                      <span className="cal-note-text">{n.text}</span>
                    </button>
                  ))}

                  {dayExecs.length + dayNotes.length > 4 && (
                    <small className="cal-more">
                      +{dayExecs.length + dayNotes.length - 4} más
                    </small>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalle del día seleccionado debajo del calendario para marcar sin salir */}
      {selectedDate && dayExecutions.length > 0 && (
        <div className="cal-day-drawer">
          <div className="exec-group-header">
            <h2>Actividades del {longDate(selectedDate)}</h2>
            <span className="group-count-pill tone-neutral">{dayExecutions.length}</span>
          </div>
          <div className="exec-group-list">
            {dayExecutions.map(ex => (
              <ExecutionRow
                key={ex.id}
                execution={ex}
                activity={actMap.get(ex.activityId)}
                today={today}
                currentUser={currentUser}
                onChangeStatus={onChangeStatus}
                onChangeExecutor={onChangeExecutor}
                onSaveObservation={onSaveObservation}
                onSelect={onSelectExecution}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

