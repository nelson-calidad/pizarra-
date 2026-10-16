import { useState } from 'react'
import { CalendarPlus, Trash2, Edit3, X, Check, Sparkles } from 'lucide-react'
import type { Activity, BranchScope, PlannerEvent, Role } from '../types'
import { todayISO, longDate } from '../lib/dates'
import { BRANCH_LABEL, EVENT_TYPES, eventTypeLabel, describeRule } from '../lib/labels'
import { SUGGESTED_TEMPLATES } from '../lib/templates'

type Props = {
  events: PlannerEvent[]
  activities: Activity[]
  currentUser: Role
  onSaveEvent: (data: Omit<PlannerEvent, 'id' | 'createdAt'>, existingId?: string) => void
  onDeleteEvent: (id: string) => void
  onCreateLinkedActivity: (data: Omit<Activity, 'id' | 'createdAt'>) => void
  onClose: () => void
}

export function EventsPanel({
  events,
  activities,
  currentUser,
  onSaveEvent,
  onDeleteEvent,
  onCreateLinkedActivity,
  onClose
}: Props) {
  const today = todayISO()
  const [editing, setEditing] = useState<PlannerEvent | null>(null)
  const [type, setType] = useState('PCGC')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [branch, setBranch] = useState<BranchScope>('AMBAS')
  const [notes, setNotes] = useState('')

  const startEdit = (ev: PlannerEvent) => {
    setEditing(ev)
    setType(ev.type)
    setTitle(ev.title || '')
    setDate(ev.date)
    setBranch(ev.branch)
    setNotes(ev.notes || '')
  }

  const resetForm = () => {
    setEditing(null)
    setTitle('')
    setNotes('')
    setDate(today)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) return
    onSaveEvent(
      {
        type,
        title: title.trim() || eventTypeLabel(type),
        date,
        branch,
        state: 'ACTIVO',
        notes: notes.trim() || undefined,
        createdBy: currentUser
      },
      editing?.id
    )
    resetForm()
  }

  const activeEvents = events
    .filter(e => e.state !== 'CANCELADO')
    .sort((a, b) => a.date.localeCompare(b.date))

  const linkedRules = activities.filter(a => a.frequency === 'EVENTO' && a.state === 'ACTIVA')
  const templatesForType = SUGGESTED_TEMPLATES.filter(
    t =>
      t.frequency === 'EVENTO' &&
      t.eventType === type &&
      !linkedRules.some(r => r.name.toLowerCase() === t.name.toLowerCase())
  )

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="composer-modal planner-modal events-modal">
        <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar">
          <X size={18} strokeWidth={2} />
        </button>

        <small className="modal-tag">FECHAS DE AUDITORÍAS Y CIERRES OFICIALES</small>
        <p className="modal-subtitle-text">
          Cargá las fechas confirmadas de PCGC, cierres oficiales de indicadores o auditorías. Las actividades vinculadas a ese evento se programarán automáticamente según sus días antes o después.
        </p>

        <form className="event-form-box" onSubmit={handleSubmit}>
          <div className="form-grid-3">
            <label className="form-block">
              <span className="form-label">Tipo de evento</span>
              <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                {EVENT_TYPES.map(ev => (
                  <option key={ev.key} value={ev.key}>
                    {ev.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-block">
              <span className="form-label">Fecha confirmada *</span>
              <input
                type="date"
                required
                className="form-input"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </label>

            <label className="form-block">
              <span className="form-label">Sucursal</span>
              <select
                className="form-select"
                value={branch}
                onChange={e => setBranch(e.target.value as BranchScope)}
              >
                <option value="AMBAS">Jujuy y Salta</option>
                <option value="JUJUY">Solo Jujuy</option>
                <option value="SALTA">Solo Salta</option>
              </select>
            </label>
          </div>

          <div className="form-grid-2" style={{ marginTop: 8 }}>
            <label className="form-block">
              <span className="form-label">Referencia / detalle (opcional)</span>
              <input
                className="form-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={`Ej.: ${eventTypeLabel(type)} Octubre`}
              />
            </label>
            <div className="event-form-actions">
              {editing && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancelar edición
                </button>
              )}
              <button type="submit" className="btn-modal-submit">
                {editing ? <Check size={15} /> : <CalendarPlus size={15} />}
                <span>{editing ? 'Actualizar fecha' : 'Registrar fecha'}</span>
              </button>
            </div>
          </div>
        </form>

        {templatesForType.length > 0 && (
          <div className="event-suggestions-banner">
            <div className="event-suggestions-header">
              <Sparkles size={14} />
              <span>
                Actividades vinculadas a <b>{eventTypeLabel(type)}</b> que podés activar con un clic:
              </span>
            </div>
            <div className="event-suggestions-list">
              {templatesForType.map(t => (
                <button
                  type="button"
                  key={t.name}
                  className="btn-Quick-rule"
                  onClick={() =>
                    onCreateLinkedActivity({
                      ...t,
                      startDate: today,
                      state: 'ACTIVA',
                      createdBy: currentUser
                    })
                  }
                >
                  <span>+ {t.name}</span>
                  <small>
                    ({t.offsetDays! < 0 ? `${-t.offsetDays!}d antes` : `${t.offsetDays}d después`})
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="events-list-section">
          <span className="detail-section-title">
            Eventos registrados ({activeEvents.length})
          </span>
          {activeEvents.length === 0 ? (
            <p className="nothing-small">
              Todavía no hay fechas de auditorías ni cierres cargadas.
            </p>
          ) : (
            <div className="events-table">
              {activeEvents.map(ev => {
                const triggered = linkedRules.filter(r => r.eventType === ev.type)
                return (
                  <div className="event-row-item" key={ev.id}>
                    <div className="event-row-main">
                      <div className="event-row-title">
                        <span className="badge-event-type">{eventTypeLabel(ev.type)}</span>
                        <b>{ev.title || eventTypeLabel(ev.type)}</b>
                        <span className={`branch-pill branch-${ev.branch.toLowerCase()}`}>
                          {BRANCH_LABEL[ev.branch]}
                        </span>
                      </div>
                      <div className="event-row-sub">
                        <span>{longDate(ev.date)}</span>
                        {triggered.length > 0 && (
                          <span className="event-triggers-info">
                            · Activa {triggered.length}{' '}
                            {triggered.length === 1 ? 'actividad' : 'actividades'} (
                            {triggered.map(t => describeRule(t)).join(', ')})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="event-row-actions">
                      <button
                        type="button"
                        className="rem-icon-btn"
                        onClick={() => startEdit(ev)}
                        title="Modificar fecha"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        className="rem-icon-btn rem-icon-delete"
                        onClick={() => {
                          if (window.confirm('¿Eliminar esta fecha de evento?')) {
                            onDeleteEvent(ev.id)
                          }
                        }}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

