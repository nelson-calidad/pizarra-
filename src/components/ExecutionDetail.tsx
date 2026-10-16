import { useState, useEffect } from 'react'
import {
  X, Check, Ban, Play, Clock, Edit3, Copy, ExternalLink, PauseCircle, Trash2
} from 'lucide-react'
import type { Activity, Execution, ExecStatus, Role } from '../types'
import { formatDateTime, longDate } from '../lib/dates'
import {
  BRANCH_LABEL, describeRule, periodLabel, ROLE_LABEL, STATUS_LABEL, VISUAL_LABEL
} from '../lib/labels'
import { leadDaysFor, visualState } from '../lib/planner'
import { visualIcon } from './ExecutionRow'

type Props = {
  execution: Execution
  activity?: Activity
  history: Execution[]
  today: string
  currentUser: Role
  onUpdateExecution: (ex: Execution, patch: Partial<Execution>) => void
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onEditActivity: (act: Activity) => void
  onDuplicateActivity: (act: Activity) => void
  onTogglePauseActivity: (act: Activity) => void
  onDeleteActivity: (act: Activity) => void
  onSelectExecution: (ex: Execution) => void
  onClose: () => void
}

export function ExecutionDetail({
  execution,
  activity,
  history,
  today,
  onUpdateExecution,
  onChangeStatus,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity,
  onDeleteActivity,
  onSelectExecution,
  onClose
}: Props) {
  const [note, setNote] = useState(execution.note || '')
  const [evidence, setEvidence] = useState(execution.evidence || '')
  const [reason, setReason] = useState(execution.reason || '')
  const [dueDate, setDueDate] = useState(execution.dueDate)

  useEffect(() => {
    setNote(execution.note || '')
    setEvidence(execution.evidence || '')
    setReason(execution.reason || '')
    setDueDate(execution.dueDate)
  }, [execution])

  const v = visualState(execution, today, leadDaysFor(activity))
  const habitual = activity?.responsible || execution.executor

  const saveFields = () => {
    onUpdateExecution(execution, {
      note: note.trim() || undefined,
      evidence: evidence.trim() || undefined,
      reason: reason.trim() || undefined,
      dueDate: dueDate || execution.dueDate
    })
  }

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-left">
          <small className="modal-tag">DETALLE DE EJECUCIÓN</small>
          <span className={`state-badge state-${v}`}>
            {visualIcon(v)}
            <span>{VISUAL_LABEL[v]}</span>
          </span>
        </div>
        <div className="detail-header-actions">
          {activity && (
            <>
              <button
                type="button"
                className="panel-icon-btn"
                onClick={() => onEditActivity(activity)}
                title="Editar actividad maestra / recurrencia"
              >
                <Edit3 size={16} />
              </button>
              <button
                type="button"
                className="panel-icon-btn"
                onClick={() => onDuplicateActivity(activity)}
                title="Duplicar actividad"
              >
                <Copy size={16} />
              </button>
            </>
          )}
          <button type="button" className="panel-close-btn" onClick={onClose} title="Cerrar panel">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="detail-content">
        <h2 className="exec-detail-title">
          {activity?.name || execution.activityName || 'Actividad'}
        </h2>
        {activity?.description && <p className="exec-detail-desc">{activity.description}</p>}

        {/* Botonera rápida de estado */}
        <div className="status-selector-grid">
          {(['PENDIENTE', 'EN_CURSO', 'REALIZADA', 'NO_REALIZADA'] as ExecStatus[]).map(st => (
            <button
              type="button"
              key={st}
              className={`status-option-btn status-opt-${st.toLowerCase()} ${
                execution.status === st ? 'active' : ''
              }`}
              onClick={() =>
                onChangeStatus(execution, st, {
                  note: note.trim() || undefined,
                  evidence: evidence.trim() || undefined,
                  reason: reason.trim() || undefined
                })
              }
            >
              {st === 'REALIZADA' && <Check size={13} strokeWidth={2.5} />}
              {st === 'EN_CURSO' && <Play size={12} />}
              {st === 'NO_REALIZADA' && <Ban size={13} />}
              {st === 'PENDIENTE' && <Clock size={12} />}
              <span>{STATUS_LABEL[st]}</span>
            </button>
          ))}
        </div>

        {/* Datos de esta ocurrencia */}
        <div className="detail-fields-card">
          <div className="field-row">
            <span className="field-label">Sucursal</span>
            <span className={`branch-pill branch-${execution.branch.toLowerCase()}`}>
              {BRANCH_LABEL[execution.branch]}
            </span>
          </div>

          <div className="field-row">
            <span className="field-label">Período / Regla</span>
            <span className="field-static">
              {periodLabel(execution.period, activity?.frequency)}
              {activity ? ` · ${describeRule(activity)}` : ''}
            </span>
          </div>

          <label className="field-row">
            <span className="field-label">Vencimiento de esta ocasión</span>
            <input
              type="date"
              className="field-input"
              value={dueDate}
              onChange={e => {
                setDueDate(e.target.value)
                if (e.target.value) onUpdateExecution(execution, { dueDate: e.target.value })
              }}
            />
          </label>

          <div className="field-row">
            <span className="field-label">Responsable habitual</span>
            <span className="field-static">{ROLE_LABEL[habitual]}</span>
          </div>

          <label className="field-row">
            <span className="field-label">Ejecutor de esta ocasión</span>
            <select
              className="field-select"
              value={execution.executor}
              onChange={e => onUpdateExecution(execution, { executor: e.target.value as Role })}
            >
              <option value="RAC">RAC</option>
              <option value="ANALISTA">Analista</option>
            </select>
          </label>

          {execution.completedAt && (
            <div className="field-row">
              <span className="field-label">Registrado el</span>
              <span className="field-static">
                {formatDateTime(execution.completedAt)}
                {execution.completedBy ? ` por ${ROLE_LABEL[execution.completedBy]}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Observación y evidencia opcionales */}
        <div className="exec-detail-section">
          <span className="detail-section-title">Observación / Hallazgos (opcional)</span>
          <textarea
            className="form-textarea"
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={saveFields}
            placeholder='Ej.: "Se controlaron 15 órdenes. Se encontraron 3 desvíos y se informó al jefe de Taller."'
          />

          <label className="form-block" style={{ marginTop: 10 }}>
            <span className="detail-section-title">Enlace a evidencia o informe (opcional)</span>
            <div className="evidence-input-row">
              <input
                className="form-input"
                value={evidence}
                onChange={e => setEvidence(e.target.value)}
                onBlur={saveFields}
                placeholder="https://drive.google.com/..."
              />
              {evidence && (
                <a
                  href={evidence}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-evidence-open"
                  title="Abrir documento"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </label>

          {execution.status === 'NO_REALIZADA' && (
            <label className="form-block" style={{ marginTop: 10 }}>
              <span className="detail-section-title">Motivo de no realización</span>
              <input
                className="form-input"
                value={reason}
                onChange={e => setReason(e.target.value)}
                onBlur={saveFields}
                placeholder="Motivo breve por el cual no pudo realizarse…"
              />
            </label>
          )}
        </div>

        {/* Historial de ejecuciones de esta actividad maestra */}
        <div className="exec-detail-section">
          <span className="detail-section-title">
            Historial y próximas ejecuciones ({history.length})
          </span>
          <div className="exec-history-list">
            {history.map(h => {
              const hv = visualState(h, today, leadDaysFor(activity))
              const isCurrent = h.id === execution.id
              return (
                <button
                  type="button"
                  key={h.id}
                  className={`exec-history-item ${isCurrent ? 'current' : ''}`}
                  onClick={() => onSelectExecution(h)}
                >
                  <span className={`state-badge state-${hv}`}>
                    {visualIcon(hv)}
                    <span>{VISUAL_LABEL[hv]}</span>
                  </span>
                  <div className="exec-history-info">
                    <b>
                      {periodLabel(h.period, activity?.frequency)} · {BRANCH_LABEL[h.branch]}
                    </b>
                    <small>
                      {longDate(h.dueDate)} · {ROLE_LABEL[h.executor]}
                      {h.note ? ` · “${h.note.slice(0, 42)}${h.note.length > 42 ? '…' : ''}”` : ''}
                    </small>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Acciones sobre la actividad maestra */}
        {activity && (
          <div className="detail-footer-actions">
            <div className="detail-secondary-actions">
              <button
                type="button"
                className="btn-detail-action"
                onClick={() => onEditActivity(activity)}
              >
                <Edit3 size={14} />
                <span>Editar regla</span>
              </button>
              <button
                type="button"
                className="btn-detail-action"
                onClick={() => onTogglePauseActivity(activity)}
              >
                <PauseCircle size={14} />
                <span>{activity.state === 'PAUSADA' ? 'Reactivar' : 'Pausar'}</span>
              </button>
              <button
                type="button"
                className="btn-detail-action btn-detail-danger"
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Desactivar esta actividad? El historial realizado se conservará.'
                    )
                  ) {
                    onDeleteActivity(activity)
                    onClose()
                  }
                }}
              >
                <Trash2 size={14} />
                <span>Desactivar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

