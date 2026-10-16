import { useState } from 'react'
import {
  Check, Clock, AlertTriangle, Play, Ban, RotateCcw, MessageSquarePlus,
  ExternalLink, MoreHorizontal, Edit3, Copy, PauseCircle, Calendar
} from 'lucide-react'
import type { Activity, Execution, ExecStatus, Role } from '../types'
import { relativeLabel, shortDate } from '../lib/dates'
import {
  BRANCH_LABEL, BRANCH_SHORT, ROLE_LABEL, VISUAL_LABEL
} from '../lib/labels'
import { leadDaysFor, visualState, type Visual } from '../lib/planner'

type Props = {
  execution: Execution
  activity?: Activity
  today: string
  currentUser: Role
  compact?: boolean
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onReschedule?: (ex: Execution, newDate: string) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelect: (ex: Execution) => void
  onEditActivity?: (act: Activity) => void
  onDuplicateActivity?: (act: Activity) => void
  onTogglePauseActivity?: (act: Activity) => void
}

export function visualIcon(v: Visual) {
  switch (v) {
    case 'done':
      return <Check size={12} strokeWidth={2.6} />
    case 'notdone':
      return <Ban size={12} strokeWidth={2.3} />
    case 'overdue':
      return <AlertTriangle size={12} strokeWidth={2.3} />
    case 'soon':
      return <Clock size={12} strokeWidth={2.3} />
    case 'progress':
      return <Play size={11} strokeWidth={2.4} />
    default:
      return <Clock size={11} strokeWidth={2} />
  }
}

export function ExecutionRow({
  execution,
  activity,
  today,
  currentUser,
  compact = false,
  onChangeStatus,
  onChangeExecutor,
  onReschedule,
  onSaveObservation,
  onSelect,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity
}: Props) {
  const v = visualState(execution, today, leadDaysFor(activity), activity)
  const [showNoteBox, setShowNoteBox] = useState(false)
  const [showNotDoneBox, setShowNotDoneBox] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [noteText, setNoteText] = useState(execution.note || '')
  const [evidenceUrl, setEvidenceUrl] = useState(execution.evidence || '')
  const [reasonText, setReasonText] = useState(execution.reason || '')

  const habitual = activity?.responsible || execution.executor
  const isReassigned = execution.executor !== habitual
  const isDone = execution.status === 'REALIZADA'

  const handleQuickComplete = () => {
    if (isDone) {
      onChangeStatus(execution, 'PENDIENTE')
    } else {
      onChangeStatus(execution, 'REALIZADA')
    }
  }

  // Etiqueta breve de fecha o ventana sin texto decorativo
  const dueBadgeText = () => {
    if (
      activity?.windowStartDay &&
      activity?.windowEndDay &&
      activity.windowEndDay > activity.windowStartDay &&
      execution.windowStart
    ) {
      return `Ventana ${shortDate(execution.windowStart)} – ${shortDate(execution.dueDate)}`
    }
    return relativeLabel(execution.dueDate, today)
  }

  return (
    <div className={`exec-row exec-visual-${v} ${compact || isDone ? 'exec-row-compact' : ''}`}>
      <div className="exec-row-main">
        {/* 1 clic para completar / reabrir */}
        <button
          type="button"
          className={`exec-check-btn status-${v}`}
          onClick={handleQuickComplete}
          title={
            isDone
              ? 'Reabrir como pendiente'
              : `Marcar realizada (${ROLE_LABEL[currentUser]})`
          }
        >
          {isDone ? <Check size={13} strokeWidth={2.8} /> : null}
        </button>

        {/* Título + sucursal + fecha/ventana */}
        <div className="exec-info" onClick={() => onSelect(execution)}>
          <div className="exec-title-line">
            <span className="exec-name">
              {activity?.name || execution.activityName || 'Actividad'}
            </span>

            <span
              className={`branch-pill branch-${execution.branch.toLowerCase()}`}
              title={`Sucursal: ${BRANCH_LABEL[execution.branch]}`}
            >
              {execution.branch === 'AMBAS' ? 'Ambas' : BRANCH_LABEL[execution.branch]}
            </span>

            {v !== 'pending' && v !== 'done' && (
              <span className={`state-badge state-${v}`}>
                {visualIcon(v)}
                <span>{VISUAL_LABEL[v]}</span>
              </span>
            )}

            <span className={`exec-date-chip ${v === 'overdue' ? 'is-overdue' : ''}`}>
              {dueBadgeText()}
            </span>

            {execution.note && (
              <span className="exec-inline-note" title={execution.note}>
                “{execution.note.length > 48 ? execution.note.slice(0, 48) + '…' : execution.note}”
              </span>
            )}

            {execution.evidence && (
              <a
                href={execution.evidence}
                target="_blank"
                rel="noreferrer"
                className="obs-link"
                onClick={e => e.stopPropagation()}
                title="Abrir evidencia o documento"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        {/* Controles rápidos: Ejecutor, Reprogramar ocasión, Observación, Menú */}
        <div className="exec-Controls">
          <div
            className={`executor-switch ${isReassigned ? 'is-reassigned' : ''}`}
            title={
              isReassigned
                ? `Responsable habitual: ${ROLE_LABEL[habitual]} · Ejecuta esta vez: ${ROLE_LABEL[execution.executor]}`
                : `Responsable: ${ROLE_LABEL[habitual]}`
            }
          >
            <select
              aria-label="Ejecutor de la ocasión"
              className="executor-select"
              value={execution.executor}
              onChange={e => onChangeExecutor(execution, e.target.value as Role)}
            >
              <option value="RAC">
                RAC{habitual === 'RAC' ? '' : ' *'}
              </option>
              <option value="ANALISTA">
                Analista{habitual === 'ANALISTA' ? '' : ' *'}
              </option>
            </select>
          </div>

          <div className="exec-quick-actions">
            {!isDone && onReschedule && (
              <button
                type="button"
                className={`btn-exec-icon ${showReschedule ? 'has-note' : ''}`}
                onClick={() => {
                  setShowReschedule(s => !s)
                  setShowNoteBox(false)
                  setShowNotDoneBox(false)
                }}
                title="Reprogramar o adelantar esta ejecución"
              >
                <Calendar size={13} />
              </button>
            )}

            <button
              type="button"
              className={`btn-exec-icon ${execution.note || showNoteBox ? 'has-note' : ''}`}
              onClick={() => {
                setNoteText(execution.note || '')
                setEvidenceUrl(execution.evidence || '')
                setShowNoteBox(s => !s)
                setShowNotDoneBox(false)
                setShowReschedule(false)
              }}
              title="Observación o enlace opcional"
            >
              <MessageSquarePlus size={13} />
            </button>

            {!isDone && execution.status !== 'NO_REALIZADA' && (
              <button
                type="button"
                className="btn-exec-icon btn-exec-notdone"
                onClick={() => {
                  setReasonText(execution.reason || '')
                  setShowNotDoneBox(s => !s)
                  setShowNoteBox(false)
                  setShowReschedule(false)
                }}
                title="Marcar como No realizada"
              >
                <Ban size={12} />
              </button>
            )}

            {isDone && (
              <button
                type="button"
                className="btn-exec-icon"
                onClick={() => onChangeStatus(execution, 'PENDIENTE')}
                title="Reabrir"
              >
                <RotateCcw size={12} />
              </button>
            )}

            {activity && (
              <div className="context-menu-wrap">
                <button
                  type="button"
                  className="btn-exec-icon"
                  onClick={() => setShowMenu(m => !m)}
                  title="Más opciones"
                >
                  <MoreHorizontal size={13} />
                </button>
                {showMenu && (
                  <div className="context-dropdown" onMouseLeave={() => setShowMenu(false)}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false)
                        onSelect(execution)
                      }}
                    >
                      <Clock size={13} /> Detalle e historial
                    </button>
                    {!isDone && execution.status !== 'EN_CURSO' && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false)
                          onChangeStatus(execution, 'EN_CURSO')
                        }}
                      >
                        <Play size={13} /> Marcar en curso
                      </button>
                    )}
                    {onEditActivity && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false)
                          onEditActivity(activity)
                        }}
                      >
                        <Edit3 size={13} /> Editar actividad
                      </button>
                    )}
                    {onDuplicateActivity && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false)
                          onDuplicateActivity(activity)
                        }}
                      >
                        <Copy size={13} /> Duplicar
                      </button>
                    )}
                    {onTogglePauseActivity && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false)
                          onTogglePauseActivity(activity)
                        }}
                      >
                        <PauseCircle size={13} />{' '}
                        {activity.state === 'PAUSADA' ? 'Reactivar' : 'Pausar'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reprogramación rápida de esta ejecución (sin alterar futuras recurrencias) */}
      {showReschedule && onReschedule && (
        <div className="exec-inline-drawer">
          <div className="reschedule-inline-row">
            <span className="form-label">Fecha para esta ejecución:</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto' }}
              defaultValue={execution.dueDate}
              onChange={e => {
                if (e.target.value) {
                  onReschedule(execution, e.target.value)
                  setShowReschedule(false)
                }
              }}
            />
            {execution.dueDate !== today && (
              <button
                type="button"
                className="btn-primary-sm"
                onClick={() => {
                  onReschedule(execution, today)
                  setShowReschedule(false)
                }}
              >
                Hacer hoy
              </button>
            )}
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={() => setShowReschedule(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Observación / evidencia opcional */}
      {showNoteBox && (
        <div className="exec-inline-drawer">
          <input
            autoFocus
            className="form-input"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Observación opcional…"
          />
          <input
            className="form-input"
            value={evidenceUrl}
            onChange={e => setEvidenceUrl(e.target.value)}
            placeholder="Enlace opcional a evidencia o documento (https://...)"
          />
          <div className="drawer-actions">
            <button type="button" className="btn-secondary-sm" onClick={() => setShowNoteBox(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary-sm"
              onClick={() => {
                onSaveObservation(execution, noteText.trim(), evidenceUrl.trim() || undefined)
                setShowNoteBox(false)
              }}
            >
              Guardar
            </button>
            {!isDone && (
              <button
                type="button"
                className="btn-success-sm"
                onClick={() => {
                  onChangeStatus(execution, 'REALIZADA', {
                    note: noteText.trim() || undefined,
                    evidence: evidenceUrl.trim() || undefined
                  })
                  setShowNoteBox(false)
                }}
              >
                <Check size={13} /> Guardar y completar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Motivo breve de No realizada */}
      {showNotDoneBox && (
        <div className="exec-inline-drawer notdone-drawer">
          <input
            autoFocus
            className="form-input"
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="Motivo breve (opcional)…"
          />
          <div className="drawer-actions">
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={() => setShowNotDoneBox(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-notdone-sm"
              onClick={() => {
                onChangeStatus(execution, 'NO_REALIZADA', {
                  reason: reasonText.trim() || undefined
                })
                setShowNotDoneBox(false)
              }}
            >
              <Ban size={12} /> Confirmar No realizada
            </button>
          </div>
        </div>
      )}

      <span className="mobile-branch-tag">{BRANCH_SHORT[execution.branch]}</span>
    </div>
  )
}
