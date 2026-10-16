import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, CalendarClock, SlidersHorizontal,
  Edit3, Copy, PauseCircle, PlayCircle, Trash2, Sparkles, CheckCircle2
} from 'lucide-react'
import type {
  Activity, BranchScope, Execution, ExecStatus, Frequency, PlannerEvent, Role
} from '../types'
import {
  endOfMonth, fromParts, monthLabel, parseISO, startOfMonth
} from '../lib/dates'
import {
  BRANCH_LABEL, describeRule, eventTypeLabel, FREQ_LABEL, ROLE_LABEL
} from '../lib/labels'
import {
  buildExecutions, leadDaysFor, matchesFilter, summarize, visualState, type ExecFilter
} from '../lib/planner'
import { ExecutionRow } from './ExecutionRow'
import { SUGGESTED_TEMPLATES, type ActivityTemplate } from '../lib/templates'

type PeriodScope = 'MONTH' | 'QUARTER' | 'YEAR'
type SubTab = 'EXECUTIONS' | 'CATALOG'

type Props = {
  activities: Activity[]
  persistedExecutions: Execution[]
  events: PlannerEvent[]
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
  onOpenNewActivity: (prefill?: Partial<Activity>) => void
  onEditActivity: (act: Activity) => void
  onDuplicateActivity: (act: Activity) => void
  onTogglePauseActivity: (act: Activity) => void
  onDeleteActivity: (act: Activity) => void
  onOpenEvents: () => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
}

export function ActivitiesSection({
  activities,
  persistedExecutions,
  events,
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
  onOpenNewActivity,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity,
  onDeleteActivity,
  onOpenEvents,
  onQuickCreateTemplate
}: Props) {
  const initParts = parseISO(today)
  const [year, setYear] = useState(initParts.y)
  const [month, setMonth] = useState(initParts.m) // 1..12
  const [scope, setScope] = useState<PeriodScope>('MONTH')
  const [subTab, setSubTab] = useState<SubTab>('EXECUTIONS')
  const [freqFilter, setFreqFilter] = useState<Frequency | 'TODAS'>('TODAS')
  const [visualFilter, setVisualFilter] = useState<ExecFilter['visual']>('previstas')

  const quarter = Math.floor((month - 1) / 3) + 1

  const { rangeFrom, rangeTo, periodTitle } = useMemo(() => {
    if (scope === 'MONTH') {
      const mStart = fromParts(year, month, 1)
      return {
        rangeFrom: mStart,
        rangeTo: endOfMonth(mStart),
        periodTitle: monthLabel(mStart.slice(0, 7)).toUpperCase()
      }
    }
    if (scope === 'QUARTER') {
      const qStartMonth = (quarter - 1) * 3 + 1
      const qEndMonth = qStartMonth + 2
      const from = fromParts(year, qStartMonth, 1)
      const to = endOfMonth(fromParts(year, qEndMonth, 1))
      return {
        rangeFrom: from,
        rangeTo: to,
        periodTitle: `${quarter}° TRIMESTRE ${year}`
      }
    }
    return {
      rangeFrom: `${year}-01-01`,
      rangeTo: `${year}-12-31`,
      periodTitle: `AÑO ${year}`
    }
  }, [year, month, scope, quarter])

  const stepPeriod = (dir: -1 | 1) => {
    if (scope === 'MONTH') {
      const total = year * 12 + (month - 1) + dir
      setYear(Math.floor(total / 12))
      setMonth((total % 12) + 1)
    } else if (scope === 'QUARTER') {
      const total = year * 12 + (month - 1) + dir * 3
      setYear(Math.floor(total / 12))
      setMonth((total % 12) + 1)
    } else {
      setYear(y => y + dir)
    }
  }

  const goToday = () => {
    const p = parseISO(today)
    setYear(p.y)
    setMonth(p.m)
  }

  const actMap = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities])

  // Todas las ejecuciones reales del rango (guardadas + generadas por reglas activas)
  const periodExecutions = useMemo(
    () => buildExecutions(activities, persistedExecutions, events, rangeFrom, rangeTo),
    [activities, persistedExecutions, events, rangeFrom, rangeTo]
  )

  // Filtradas por persona, sucursal, frecuencia y búsqueda (para calcular el resumen real del contexto)
  const contextExecutions = useMemo(
    () =>
      periodExecutions.filter(e =>
        matchesFilter(
          e,
          { person: personFilter, branch: branchFilter, frequency: freqFilter, query },
          actMap.get(e.activityId),
          today
        )
      ),
    [periodExecutions, personFilter, branchFilter, freqFilter, query, actMap, today]
  )

  const summary = useMemo(() => summarize(contextExecutions, today), [contextExecutions, today])

  // Lista final aplicando también el filtro de estado visual
  const shownExecutions = useMemo(
    () =>
      contextExecutions.filter(e =>
        matchesFilter(e, { visual: visualFilter }, actMap.get(e.activityId), today)
      ),
    [contextExecutions, visualFilter, actMap, today]
  )

  // Agrupación prioritaria cuando se mira un mes, o mes a mes cuando se mira Trimestre / Año
  const groups = useMemo(() => {
    if (scope !== 'MONTH') {
      const byMonth = new Map<string, Execution[]>()
      for (const e of shownExecutions) {
        const mk = e.dueDate.slice(0, 7)
        const arr = byMonth.get(mk) || []
        arr.push(e)
        byMonth.set(mk, arr)
      }
      return [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mk, list]) => {
          const s = summarize(list, today)
          return {
            key: mk,
            title: monthLabel(mk),
            badge: `${s.realizadas}/${s.previstas} realizadas${
              s.vencidas ? ` · ${s.vencidas} vencidas` : ''
            }`,
            tone: s.vencidas > 0 ? 'danger' : 'neutral',
            items: list
          }
        })
    }

    const overdueList: Execution[] = []
    const todayList: Execution[] = []
    const soonOrProgressList: Execution[] = []
    const upcomingList: Execution[] = []
    const doneList: Execution[] = []
    const notDoneList: Execution[] = []

    for (const e of shownExecutions) {
      const v = visualState(e, today, leadDaysFor(actMap.get(e.activityId)))
      if (v === 'overdue') overdueList.push(e)
      else if (v === 'done') doneList.push(e)
      else if (v === 'notdone') notDoneList.push(e)
      else if (e.dueDate === today) todayList.push(e)
      else if (v === 'soon' || v === 'progress') soonOrProgressList.push(e)
      else upcomingList.push(e)
    }

    return [
      { key: 'overdue', title: 'Vencidas · Requieren atención', badge: String(overdueList.length), tone: 'danger', items: overdueList },
      { key: 'today', title: 'Para hoy', badge: String(todayList.length), tone: 'warning', items: todayList },
      { key: 'soon', title: 'En curso y próximas a vencer', badge: String(soonOrProgressList.length), tone: 'info', items: soonOrProgressList },
      { key: 'upcoming', title: 'Programadas en el mes', badge: String(upcomingList.length), tone: 'neutral', items: upcomingList },
      { key: 'done', title: 'Realizadas', badge: String(doneList.length), tone: 'success', items: doneList },
      { key: 'notdone', title: 'No realizadas', badge: String(notDoneList.length), tone: 'notdone', items: notDoneList }
    ].filter(g => g.items.length > 0)
  }, [shownExecutions, scope, today, actMap])

  const activeActivities = activities.filter(a => a.state !== 'INACTIVA')
  const upcomingEventsCount = events.filter(e => e.state === 'ACTIVO' && e.date >= startOfMonth(today)).length

  return (
    <section className="planner-page">
      {/* Encabezado de período + Resumen mensual / trimestral / anual */}
      <div className="planner-top-card">
        <div className="planner-period-bar">
          <div className="period-nav-group">
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => stepPeriod(-1)}
              title="Período anterior"
            >
              <ChevronLeft size={17} />
            </button>
            <h1 className="period-heading">{periodTitle}</h1>
            <button
              type="button"
              className="period-arrow-btn"
              onClick={() => stepPeriod(1)}
              title="Período siguiente"
            >
              <ChevronRight size={17} />
            </button>
            <button type="button" className="btn-today-chip" onClick={goToday}>
              Mes actual
            </button>
          </div>

          <div className="period-right-controls">
            <div className="segmented-control segmented-sm">
              <button
                type="button"
                className={scope === 'MONTH' ? 'active' : ''}
                onClick={() => setScope('MONTH')}
              >
                Mes
              </button>
              <button
                type="button"
                className={scope === 'QUARTER' ? 'active' : ''}
                onClick={() => setScope('QUARTER')}
              >
                Trimestre
              </button>
              <button
                type="button"
                className={scope === 'YEAR' ? 'active' : ''}
                onClick={() => setScope('YEAR')}
              >
                Año
              </button>
            </div>

            <button
              type="button"
              className="btn-events-trigger"
              onClick={onOpenEvents}
              title="Cargar o modificar fechas reales de PCGC, cierres de indicadores o auditorías"
            >
              <CalendarClock size={15} />
              <span>Auditorías y cierres</span>
              {upcomingEventsCount > 0 && (
                <em className="events-count-pill">{upcomingEventsCount}</em>
              )}
            </button>

            <button
              type="button"
              className={`btn-catalog-trigger ${subTab === 'CATALOG' ? 'active' : ''}`}
              onClick={() => setSubTab(t => (t === 'CATALOG' ? 'EXECUTIONS' : 'CATALOG'))}
              title="Ver y administrar todas las reglas de actividades"
            >
              <SlidersHorizontal size={14} />
              <span>
                {subTab === 'CATALOG'
                  ? 'Volver al plan del período'
                  : `Reglas (${activeActivities.length})`}
              </span>
            </button>
          </div>
        </div>

        {/* Tarjetas de resumen calculadas desde las ejecuciones reales (sirven como filtro rápido) */}
        <div className="summary-strip" role="region" aria-label="Resumen del período">
          <button
            type="button"
            className={`summary-stat-card ${visualFilter === 'previstas' ? 'selected' : ''}`}
            onClick={() => {
              setSubTab('EXECUTIONS')
              setVisualFilter('previstas')
            }}
          >
            <span className="summary-label">Previstas</span>
            <strong className="summary-num">{summary.previstas}</strong>
          </button>

          <button
            type="button"
            className={`summary-stat-card stat-done ${visualFilter === 'done' ? 'selected' : ''}`}
            onClick={() => {
              setSubTab('EXECUTIONS')
              setVisualFilter(v => (v === 'done' ? 'previstas' : 'done'))
            }}
          >
            <span className="summary-label">Realizadas</span>
            <strong className="summary-num">{summary.realizadas}</strong>
          </button>

          <button
            type="button"
            className={`summary-stat-card stat-pending ${
              visualFilter === 'pendientes' ? 'selected' : ''
            }`}
            onClick={() => {
              setSubTab('EXECUTIONS')
              setVisualFilter(v => (v === 'pendientes' ? 'previstas' : 'pendientes'))
            }}
          >
            <span className="summary-label">Pendientes</span>
            <strong className="summary-num">{summary.pendientes}</strong>
          </button>

          <button
            type="button"
            className={`summary-stat-card stat-overdue ${
              visualFilter === 'overdue' ? 'selected' : ''
            }`}
            onClick={() => {
              setSubTab('EXECUTIONS')
              setVisualFilter(v => (v === 'overdue' ? 'previstas' : 'overdue'))
            }}
          >
            <span className="summary-label">Vencidas</span>
            <strong className="summary-num">{summary.vencidas}</strong>
          </button>

          <button
            type="button"
            className={`summary-stat-card stat-notdone ${
              visualFilter === 'notdone' ? 'selected' : ''
            }`}
            onClick={() => {
              setSubTab('EXECUTIONS')
              setVisualFilter(v => (v === 'notdone' ? 'previstas' : 'notdone'))
            }}
          >
            <span className="summary-label">No realizadas</span>
            <strong className="summary-num">{summary.noRealizadas}</strong>
          </button>
        </div>

        {/* Barra de filtros rápidos */}
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

          <div className="filter-group">
            <span className="filter-group-label">Frecuencia:</span>
            <select
              className="filter-select-compact"
              value={freqFilter}
              onChange={e => setFreqFilter(e.target.value as Frequency | 'TODAS')}
            >
              <option value="TODAS">Todas las frecuencias</option>
              {(Object.keys(FREQ_LABEL) as Frequency[]).map(f => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-group-label">Estado:</span>
            <select
              className="filter-select-compact"
              value={visualFilter || 'previstas'}
              onChange={e => setVisualFilter(e.target.value as ExecFilter['visual'])}
            >
              <option value="previstas">Todos los estados</option>
              <option value="pendientes">Pendientes + En curso</option>
              <option value="progress">Solo En curso</option>
              <option value="soon">Próximas a vencer</option>
              <option value="overdue">Vencidas</option>
              <option value="done">Realizadas</option>
              <option value="notdone">No realizadas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contenido: Ejecuciones del período o Catálogo de Reglas */}
      {subTab === 'CATALOG' ? (
        <div className="catalog-container">
          <div className="catalog-header">
            <div>
              <h2>Reglas y actividades maestras ({activeActivities.length})</h2>
              <p>
                Podés pausar, reactivar, duplicar o cambiar la frecuencia de cualquier actividad sin alterar las ejecuciones históricas ya registradas.
              </p>
            </div>
            <button
              type="button"
              className="btn-new-note"
              onClick={() => onOpenNewActivity()}
            >
              <Plus size={16} strokeWidth={2.4} />
              <span>+ Nueva actividad</span>
            </button>
          </div>

          {activeActivities.length === 0 ? (
            <EmptyActivitiesState
              onOpenNewActivity={onOpenNewActivity}
              onQuickCreateTemplate={onQuickCreateTemplate}
            />
          ) : (
            <div className="catalog-list">
              {activeActivities.map(act => (
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
                        {act.branch === 'AMBAS' && act.splitBranches ? ' (indiv.)' : ''}
                      </span>
                      <span className="role-pill">Hab: {ROLE_LABEL[act.responsible]}</span>
                      {act.state === 'PAUSADA' && (
                        <span className="paused-badge">Pausada</span>
                      )}
                    </div>
                    {act.description && <p className="catalog-desc">{act.description}</p>}
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
                      title="Duplicar actividad"
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
                            '¿Desactivar esta actividad? El historial previo se conservará.'
                          )
                        ) {
                          onDeleteActivity(act)
                        }
                      }}
                      title="Desactivar actividad"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeActivities.length === 0 && persistedExecutions.length === 0 ? (
        <EmptyActivitiesState
          onOpenNewActivity={onOpenNewActivity}
          onQuickCreateTemplate={onQuickCreateTemplate}
        />
      ) : groups.length === 0 ? (
        <div className="planner-empty-box">
          <CheckCircle2 size={28} strokeWidth={1.8} />
          <h3>No hay ejecuciones con los filtros seleccionados en {periodTitle}</h3>
          <p>
            Probá cambiando el filtro de estado, persona o sucursal, o agregá una nueva actividad.
          </p>
          <div className="empty-box-actions">
            {visualFilter !== 'previstas' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setVisualFilter('previstas')}
              >
                Ver todas las previstas ({summary.previstas})
              </button>
            )}
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
      ) : (
        <div className="exec-groups-container">
          {groups.map(g => (
            <div className="exec-group" key={g.key}>
              <div className="exec-group-header">
                <h2>{g.title}</h2>
                <span className={`group-count-pill tone-${g.tone}`}>{g.badge}</span>
              </div>
              <div className="exec-group-list">
                {g.items.map(ex => (
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
                    onEditActivity={onEditActivity}
                    onDuplicateActivity={onDuplicateActivity}
                    onTogglePauseActivity={onTogglePauseActivity}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyActivitiesState({
  onOpenNewActivity,
  onQuickCreateTemplate
}: {
  onOpenNewActivity: (prefill?: Partial<Activity>) => void
  onQuickCreateTemplate: (tpl: ActivityTemplate) => void
}) {
  return (
    <div className="planner-onboarding">
      <div className="onboarding-head">
        <h2>Planificador Operativo de Calidad · Jujuy y Salta</h2>
        <p>
          Todavía no cargaste actividades operativas. Creá una con <b>+ Nueva actividad</b> o incorporá con un clic cualquiera de las actividades habituales de Autosol y ajustá sus fechas:
        </p>
        <button
          type="button"
          className="btn-new-note"
          onClick={() => onOpenNewActivity()}
        >
          <Plus size={16} strokeWidth={2.4} />
          <span>+ Nueva actividad</span>
        </button>
      </div>

      <div className="onboarding-templates">
        <div className="onboarding-templates-title">
          <Sparkles size={15} />
          <span>Actividades sugeridas de Calidad (clic para agregar)</span>
        </div>
        <div className="onboarding-grid">
          {SUGGESTED_TEMPLATES.map(t => (
            <div className="onboarding-card" key={t.name}>
              <div className="onboarding-card-info">
                <b>{t.name}</b>
                <small>
                  {t.frequency === 'EVENTO'
                    ? `${eventTypeLabel(t.eventType)} (${
                        t.offsetDays! < 0 ? `${-t.offsetDays!}d antes` : `${t.offsetDays}d después`
                      })`
                    : FREQ_LABEL[t.frequency]}{' '}
                  · {BRANCH_LABEL[t.branch]} · Hab: {ROLE_LABEL[t.responsible]}
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

