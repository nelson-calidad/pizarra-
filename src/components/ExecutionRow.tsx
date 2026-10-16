import { useState } from 'react'
import {
  Check, Clock, AlertTriangle, Play, Ban, RotateCcw, MessageSquarePlus,
  ExternalLink, MoreHorizontal, Edit3, Copy, PauseCircle
} from 'lucide-react'
import type { Activity, Execution, ExecStatus, Role } from '../types'
import { relativeLabel, formatDateTime } from '../lib/dates'
import {
  BRANCH_LABEL, BRANCH_SHORT, describeRule, periodLabel, ROLE_LABEL, VISUAL_LABEL
} from '../lib/labels'
import { leadDaysFor, visualState, type Visual } from '../lib/planner'

type Props = {
  execution: Execution
  activity?: Activity
  today: string
  currentUser: Role
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelect: (ex: Execution) => void
  onEditActivity?: (act: Activity) => void
  onDuplicateActivity?: (act: Activity) => void
  onTogglePauseActivity?: (act: Activity) => void
}

export function visualIcon(v: Visual) {
  switch (v) {
    case 'done':
      return <Check size={13} strokeWidth={2.6} />
    case 'notdone':
      return <Ban size={13} strokeWidth={2.3} />
    case 'overdue':
      return <AlertTriangle size={13} strokeWidth={2.3} />
    case 'soon':
      return <Clock size={13} strokeWidth={2.3} />
    case 'progress':
      return <Play size={12} strokeWidth={2.4} />
    default:
      return <Clock size={12} strokeWidth={2} />
  }
}

export function ExecutionRow({
  execution,
  activity,
  today,
  currentUser,
  onChangeStatus,
  onChangeExecutor,
  onSaveObservation,
  onSelect,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity
}: Props) {
  const v = visualState(execution, today, leadDaysFor(activity))
  const [showNoteBox, setShowNoteBox] = useState(false)
  const [showNotDoneBox, setShowNotDoneBox] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [noteText, setNoteText] = useState(execution.note || '')
  const [evidenceUrl, setEvidenceUrl] = useState(execution.evidence || '')
  const [reasonText, setReasonText] = useState(execution.reason || '')

  const habitual = activity?.responsible || execution.executor
  const isReassigned = execution.executor !== habitual

  const handleQuickComplete = () => {
    if (execution.status === 'REALIZADA') {
      onChangeStatus(execution, 'PENDIENTE')
    } else {
      onChangeStatus(execution, 'REALIZADA')
    }
  }

  return (
    <div className={`exec-row exec-visual-${v}`}>
      <div className="exec-row-main">
        {/* Botón rápido de completado en 1 clic */}
        <button
          type="button"
          className={`exec-check-btn status-${v}`}
          onClick={handleQuickComplete}
          title={
            execution.status === 'REALIZADA'
              ? 'Reabrir (volver a pendiente)'
              : `Marcar como realizada por ${ROLE_LABEL[currentUser]}`
          }
        >
          {execution.status === 'REALIZADA' ? <Check size={14} strokeWidth={2.8} /> : null}
        </button>

        {/* Información central */}
        <div className="exec-info" onClick={() => onSelect(execution)}>
          <div className="exec-title-line">
            <span className="exec-name">
              {activity?.name || execution.activityName || 'Actividad'}
            </span>

            {/* Etiqueta de estado con icono y texto (no depende solo del color) */}
            <span className={`state-badge state-${v}`}>
              {visualIcon(v)}
              <span>{VISUAL_LABEL[v]}</span>
            </span>

            {/* Sucursal */}
            <span
              className={`branch-pill branch-${execution.branch.toLowerCase()}`}
              title={`Sucursal: ${BRANCH_LABEL[execution.branch]}`}
            >
              {BRANCH_LABEL[execution.branch]}
            </span>

            {activity?.category && (
              <span className="exec-category-tag">{activity.category}</span>
            )}
          </div>

          <div className="exec-meta-line">
            <span className={`exec-due ${v === 'overdue' ? 'is-overdue' : ''}`}>
              Vence: <b>{relativeLabel(execution.dueDate, today)}</b> ({execution.dueDate})
            </span>
            <span className="meta-sep">·</span>
            <span className="exec-period-tag">
              {activity ? describeRule(activity) : periodLabel(execution.period)}
            </span>

            {execution.completedAt && execution.status === 'REALIZADA' && (
              <>
                <span className="meta-sep">·</span>
                <span className="exec-completed-stamp">
                  Realizada el {formatDateTime(execution.completedAt)}
                  {execution.completedBy ? ` por ${ROLE_LABEL[execution.completedBy]}` : ''}
                </span>
              </>
            )}

            {execution.status === 'NO_REALIZADA' && (
              <>
                <span className="meta-sep">·</span>
                <span className="exec-notdone-stamp">
                  No realizada{execution.reason ? `: "${execution.reason}"` : ''}
                </span>
              </>
            )}
          </div>

          {(execution.note || execution.evidence) && (
            <div className="exec-observation-preview">
              {execution.note && <span className="obs-text">“{execution.note}”</span>}
              {execution.evidence && (
                <a
                  href={execution.evidence}
                  target="_blank"
                  rel="noreferrer"
                  className="obs-link"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                  <span>Evidencia / documento</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Selector de ejecutor de esta ocasión (sin alterar el responsable habitual) */}
        <div className="exec-Controls">
          <div
            className={`executor-switch ${isReassigned ? 'is-reassigned' : ''}`}
            title={
              isReassigned
                ? `Responsable habitual: ${ROLE_LABEL[habitual]} · Ejecuta esta vez: ${ROLE_LABEL[execution.executor]}`
                : `Responsable habitual y ejecutor: ${ROLE_LABEL[habitual]}`
            }
          >
            <select
              aria-label="Ejecutor de esta ocasión"
              className="executor-select"
              value={execution.executor}
              onChange={e => onChangeExecutor(execution, e.target.value as Role)}
            >
              <option value="RAC">
                👤 RAC{habitual === 'RAC' ? '' : ' (esta vez)'}
              </option>
              <option value="ANALISTA">
                👤 Analista{habitual === 'ANALISTA' ? '' : ' (esta vez)'}
              </option>
            </select>
            {isReassigned && (
              <small className="habitual-tag" title="Responsable habitual">
                Hab: {ROLE_LABEL[habitual]}
              </small>
            )}
          </div>

          {/* Botones de estado rápido */}
          <div className="exec-quick-actions">
            {execution.status !== 'REALIZADA' ? (
              <button
                type="button"
                className="btn-exec-action btn-exec-done"
                onClick={() => onChangeStatus(execution, 'REALIZADA')}
                title="Marcar como realizada"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Realizada</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-exec-action"
                onClick={() => onChangeStatus(execution, 'PENDIENTE')}
                title="Reabrir como pendiente"
              >
                <RotateCcw size={12} />
                <span>Reabrir</span>
              </button>
            )}

            {execution.status === 'PENDIENTE' && (
              <button
                type="button"
                className="btn-exec-icon"
                onClick={() => onChangeStatus(execution, 'EN_CURSO')}
                title="Marcar en curso"
              >
                <Play size={13} />
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
              }}
              title="Agregar o editar observación / evidencia opcional"
            >
              <MessageSquarePlus size={14} />
            </button>

            {execution.status !== 'NO_REALIZADA' && (
              <button
                type="button"
                className="btn-exec-icon btn-exec-notdone"
                onClick={() => {
                  setReasonText(execution.reason || '')
                  setShowNotDoneBox(s => !s)
                  setShowNoteBox(false)
                }}
                title="Marcar como No realizada (con motivo breve opcional)"
              >
                <Ban size={13} />
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
                  <MoreHorizontal size={14} />
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
                      <Clock size={13} /> Ver historial de la actividad
                    </button>
                    {onEditActivity && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false)
                          onEditActivity(activity)
                        }}
                      >
                        <Edit3 size={13} /> Editar regla de actividad
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
                        <Copy size={13} /> Duplicar actividad
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
                        {activity.state === 'PAUSADA' ? 'Reactivar actividad' : 'Pausar actividad'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Caja desplegable rápida para observación y evidencia opcional */}
      {showNoteBox && (
        <div className="exec-inline-drawer">
          <input
            autoFocus
            className="form-input"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder='Observación opcional (ej.: "Se controlaron 15 órdenes. Se encontraron 3 desvíos y se informó al jefe de Taller.")'
          />
          <input
            className="form-input"
            value={evidenceUrl}
            onChange={e => setEvidenceUrl(e.target.value)}
            placeholder="Enlace opcional a evidencia, informe o documento (https://...)"
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
              Guardar observación
            </button>
            {execution.status !== 'REALIZADA' && (
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
                <Check size={13} /> Guardar y marcar Realizada
              </button>
            )}
          </div>
        </div>
      )}

      {/* Caja desplegable rápida para registrar "No realizada" con motivo breve */}
      {showNotDoneBox && (
        <div className="exec-inline-drawer notdone-drawer">
          <input
            autoFocus
            className="form-input"
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="Motivo breve por el cual no pudo realizarse (opcional)…"
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
              <Ban size={13} /> Confirmar No realizada
            </button>
          </div>
        </div>
      )}

      {/* Mini badge para vista compacta móvil */}
      <span className="mobile-branch-tag">{BRANCH_SHORT[execution.branch]}</span>
    </div>
  )
}

