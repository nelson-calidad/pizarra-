import { useState } from 'react'
import {
  Check, Clock, AlertTriangle, Play, Ban, RotateCcw, MessageSquarePlus,
  ExternalLink, MoreHorizontal, Edit3, Copy, PauseCircle, Calendar, Users,
  CheckCircle2
} from 'lucide-react'
import type { Activity, Execution, ExecStatus, Role } from '../types'
import { relativeLabel, shortDate } from '../lib/dates'
import {
  BRANCH_LABEL, BRANCH_SHORT, ROLE_LABEL,
  getDefaultCompletionLabel
} from '../lib/labels'
import {
  leadDaysFor, visualState, toggleAnyCompletion, toggleJointCompletion,
  toggleIndividualConfirmation, type Visual
} from '../lib/planner'

type Props = {
  execution: Execution
  activity?: Activity
  today: string
  currentUser: Role
  compact?: boolean
  hideTitle?: boolean
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onReschedule?: (ex: Execution, newDate: string) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelect: (ex: Execution) => void
  onEditActivity?: (act: Activity) => void
  onDuplicateActivity?: (act: Activity) => void
  onTogglePauseActivity?: (act: Activity) => void
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return ''
  }
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
  hideTitle = false,
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
  const isDone = execution.status === 'REALIZADA'

  // Modalidad y verbo de acción
  const mode = execution.completionMode || activity?.completionMode || 'CUALQUIERA'
  const actionVerb = getDefaultCompletionLabel(
    activity?.name || execution.activityName,
    execution.completionLabel || activity?.completionLabel
  )

  const handleQuickComplete = () => {
    if (mode === 'AMBOS_INDIVIDUAL') {
      const patch = toggleIndividualConfirmation(execution, currentUser)
      onChangeStatus(execution, patch.status || execution.status, patch)
      return
    }
    if (mode === 'CONJUNTA') {
      const patch = toggleJointCompletion(execution, currentUser, ['RAC', 'ANALISTA'])
      onChangeStatus(execution, patch.status || execution.status, patch)
      return
    }
    // CUALQUIERA
    const patch = toggleAnyCompletion(execution, currentUser)
    onChangeStatus(execution, patch.status || execution.status, patch)
  }

  const handleConfirmRole = (role: Role) => {
    const patch = toggleIndividualConfirmation(execution, role)
    onChangeStatus(execution, patch.status || execution.status, patch)
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

  const completedTimeStr = formatTime(execution.completedAt)

  return (
    <div className={`exec-row exec-visual-${v} ${compact || isDone ? 'exec-row-compact' : ''} ${hideTitle ? 'exec-row-sub' : ''}`}>
      <div className="exec-row-main">
        {/* Acción principal de 1 clic: casilla de verificación */}
        {mode !== 'AMBOS_INDIVIDUAL' && (
          <button
            type="button"
            className={`exec-check-btn status-${v} ${isDone ? 'is-completed' : ''}`}
            onClick={handleQuickComplete}
            title={
              isDone
                ? 'Hacé clic para reabrir como pendiente'
                : `Marcar ${actionVerb} (como ${ROLE_LABEL[currentUser]})`
            }
          >
            {isDone ? <Check size={13} strokeWidth={2.8} /> : null}
          </button>
        )}

        {/* Título / Datos de la actividad */}
        <div className="exec-info" onClick={() => onSelect(execution)}>
          <div className="exec-title-line">
            {!hideTitle && (
              <span className="exec-name">
                {activity?.name || execution.activityName || 'Actividad'}
              </span>
            )}

            <span
              className={`branch-pill branch-${execution.branch.toLowerCase()}`}
              title={`Sucursal: ${BRANCH_LABEL[execution.branch]}`}
            >
              {execution.branch === 'AMBAS' ? 'Jujuy y Salta' : BRANCH_LABEL[execution.branch]}
            </span>

            {!hideTitle && mode === 'CONJUNTA' && (
              <span className="exec-mode-pill mode-conjunta" title="Modalidad: Trabajo conjunto (RAC + Analista)">
                <Users size={11} /> Conjunta
              </span>
            )}

            {!hideTitle && mode === 'AMBOS_INDIVIDUAL' && (
              <span className="exec-mode-pill mode-ambos" title="Modalidad: Revisión individual de ambos">
                <CheckCircle2 size={11} /> Ambos indiv.
              </span>
            )}

            {/* Estado claro y ordenado: sin etiquetas redundantes */}
            {isDone ? (
              <span className="exec-status-text is-done">
                ✓ {actionVerb} por {execution.completedBy ? ROLE_LABEL[execution.completedBy] : ROLE_LABEL[execution.executor]}
                {completedTimeStr ? ` · ${completedTimeStr}` : ''}
              </span>
            ) : v === 'overdue' ? (
              <span className="exec-status-text is-overdue">
                <AlertTriangle size={12} strokeWidth={2.3} />
                <span>Vencida{execution.dueDate ? ` (${shortDate(execution.dueDate)})` : ''}</span>
              </span>
            ) : v === 'progress' ? (
              <span className="exec-status-text is-progress">
                <Play size={11} strokeWidth={2.4} />
                <span>En curso</span>
              </span>
            ) : (
              <span className="exec-status-text is-pending">
                Pendiente
              </span>
            )}

            {!hideTitle && execution.dueDate !== today && v !== 'overdue' && (
              <span className="exec-date-chip">
                {dueBadgeText()}
              </span>
            )}

            {execution.note && (
              <span className="exec-inline-note" title={execution.note}>
                “{execution.note.length > 40 ? execution.note.slice(0, 40) + '…' : execution.note}”
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

          {/* Sublínea con botones para AMBOS_INDIVIDUAL */}
          {mode === 'AMBOS_INDIVIDUAL' && (
            <div className="exec-dual-confirm-row" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className={`dual-confirm-btn ${execution.confirmations?.RAC?.status === 'REALIZADA' ? 'is-confirmed' : ''}`}
                onClick={() => handleConfirmRole('RAC')}
                title={execution.confirmations?.RAC?.status === 'REALIZADA' ? 'Confirmado por RAC. Clic para deshacer.' : 'Clic para confirmar como RAC'}
              >
                {execution.confirmations?.RAC?.status === 'REALIZADA' ? <Check size={11} strokeWidth={2.6} /> : <span className="dot-pending" />}
                <span>RAC: {execution.confirmations?.RAC?.status === 'REALIZADA' ? actionVerb : 'Pendiente'}</span>
                {execution.confirmations?.RAC?.completedAt && (
                  <small>{formatTime(execution.confirmations.RAC.completedAt)}</small>
                )}
              </button>

              <button
                type="button"
                className={`dual-confirm-btn ${execution.confirmations?.ANALISTA?.status === 'REALIZADA' ? 'is-confirmed' : ''}`}
                onClick={() => handleConfirmRole('ANALISTA')}
                title={execution.confirmations?.ANALISTA?.status === 'REALIZADA' ? 'Confirmado por Analista. Clic para deshacer.' : 'Clic para confirmar como Analista'}
              >
                {execution.confirmations?.ANALISTA?.status === 'REALIZADA' ? <Check size={11} strokeWidth={2.6} /> : <span className="dot-pending" />}
                <span>Analista: {execution.confirmations?.ANALISTA?.status === 'REALIZADA' ? actionVerb : 'Pendiente'}</span>
                {execution.confirmations?.ANALISTA?.completedAt && (
                  <small>{formatTime(execution.confirmations.ANALISTA.completedAt)}</small>
                )}
              </button>

              <span className="dual-progress-tag">
                {isDone
                  ? '✓ Cumplido por ambos'
                  : execution.confirmations?.RAC?.status === 'REALIZADA' || execution.confirmations?.ANALISTA?.status === 'REALIZADA'
                  ? '1/2 completado'
                  : '0/2 completado'}
              </span>
            </div>
          )}
        </div>

        {/* Acciones secundarias: Menú discreto ··· */}
        <div className="exec-Controls">
          <div className="context-menu-wrap">
            <button
              type="button"
              className="btn-exec-icon"
              onClick={() => setShowMenu(m => !m)}
              title="Más opciones"
            >
              <MoreHorizontal size={14} />
            </button>

            {showMenu && (
              <div className="context-dropdown" onMouseLeave={() => setShowMenu(false)}>
                {isDone && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      handleQuickComplete()
                    }}
                  >
                    <RotateCcw size={13} /> Deshacer cumplimiento
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false)
                    onSelect(execution)
                  }}
                >
                  <Clock size={13} /> Ver detalle e historial
                </button>

                {!isDone && onReschedule && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      setShowReschedule(true)
                      setShowNoteBox(false)
                      setShowNotDoneBox(false)
                    }}
                  >
                    <Calendar size={13} /> Reprogramar fecha
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false)
                    setShowNoteBox(true)
                    setShowReschedule(false)
                    setShowNotDoneBox(false)
                  }}
                >
                  <MessageSquarePlus size={13} /> Observación o evidencia
                </button>

                {!isDone && (
                  <div className="dropdown-sub-action">
                    <span className="dropdown-sub-label">Asignar ejecución:</span>
                    <div className="dropdown-role-buttons">
                      <button
                        type="button"
                        className={execution.executor === 'RAC' ? 'active' : ''}
                        onClick={() => {
                          onChangeExecutor(execution, 'RAC')
                          setShowMenu(false)
                        }}
                      >
                        RAC
                      </button>
                      <button
                        type="button"
                        className={execution.executor === 'ANALISTA' ? 'active' : ''}
                        onClick={() => {
                          onChangeExecutor(execution, 'ANALISTA')
                          setShowMenu(false)
                        }}
                      >
                        Analista
                      </button>
                    </div>
                  </div>
                )}

                {/* Acción secundaria para registrar que trabajaron Ambos */}
                {!isDone && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      const patch = toggleJointCompletion(execution, currentUser, ['RAC', 'ANALISTA'])
                      onChangeStatus(execution, patch.status || 'REALIZADA', patch)
                    }}
                    title="Registrar que trabajaron juntos RAC y Analista"
                  >
                    <Users size={13} /> Realizado por Ambos (RAC + Analista)
                  </button>
                )}

                {!isDone && execution.status !== 'NO_REALIZADA' && (
                  <button
                    type="button"
                    className="dropdown-item-danger"
                    onClick={() => {
                      setShowMenu(false)
                      setShowNotDoneBox(true)
                    }}
                  >
                    <Ban size={13} /> Marcar no realizada
                  </button>
                )}

                {activity && onEditActivity && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onEditActivity(activity)
                    }}
                  >
                    <Edit3 size={13} /> Editar catálogo
                  </button>
                )}

                {activity && onDuplicateActivity && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onDuplicateActivity(activity)
                    }}
                  >
                    <Copy size={13} /> Duplicar actividad
                  </button>
                )}

                {activity && onTogglePauseActivity && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onTogglePauseActivity(activity)
                    }}
                  >
                    <PauseCircle size={13} /> {activity.state === 'PAUSADA' ? 'Reactivar' : 'Pausar actividad'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reprogramación rápida */}
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

      {/* Observación / evidencia */}
      {showNoteBox && (
        <div className="exec-inline-drawer">
          <input
            autoFocus
            className="form-input"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Observación de la ejecución…"
          />
          <input
            className="form-input"
            value={evidenceUrl}
            onChange={e => setEvidenceUrl(e.target.value)}
            placeholder="Enlace de evidencia (https://...)"
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
              Guardar nota
            </button>
            {!isDone && (
              <button
                type="button"
                className="btn-success-sm"
                onClick={() => {
                  onChangeStatus(execution, 'REALIZADA', {
                    note: noteText.trim() || undefined,
                    evidence: evidenceUrl.trim() || undefined,
                    completedBy: currentUser
                  })
                  setShowNoteBox(false)
                }}
              >
                <Check size={13} /> Guardar y marcar {actionVerb}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Motivo de No realizada */}
      {showNotDoneBox && (
        <div className="exec-inline-drawer notdone-drawer">
          <input
            autoFocus
            className="form-input"
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="Motivo por el que no se realizó…"
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
