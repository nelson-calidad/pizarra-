import { useState } from 'react'
import { X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { Activity, BranchScope, Frequency, Role } from '../types'
import { todayISO } from '../lib/dates'
import {
  BRANCH_LABEL, CATEGORIES, EVENT_TYPES, FREQ_LABEL, ROLE_LABEL, ROLE_LONG
} from '../lib/labels'
import { SUGGESTED_TEMPLATES, type ActivityTemplate } from '../lib/templates'

type Props = {
  initial?: Partial<Activity>
  isEdit?: boolean
  defaultRole?: Role
  onSave: (data: Omit<Activity, 'id' | 'createdAt'>, existingId?: string) => void
  onClose: () => void
}

export function ActivityModal({ initial, isEdit, defaultRole = 'RAC', onSave, onClose }: Props) {
  const today = todayISO()
  const [name, setName] = useState(initial?.name || '')
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency || 'MENSUAL')
  const [branch, setBranch] = useState<BranchScope>(initial?.branch || 'AMBAS')
  const [splitBranches, setSplitBranches] = useState<boolean>(
    initial?.splitBranches !== undefined ? initial.splitBranches : true
  )
  const [responsible, setResponsible] = useState<Role>(initial?.responsible || defaultRole)
  const [startDate, setStartDate] = useState(initial?.startDate || today)
  const [description, setDescription] = useState(initial?.description || '')

  // Opciones avanzadas
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      initial?.frequency === 'EVENTO' ||
      (initial?.interval && initial.interval > 1) ||
      initial?.endDate ||
      initial?.category
    )
  )
  const [interval, setIntervalVal] = useState<number>(initial?.interval || 1)
  const [businessDaysOnly, setBusinessDaysOnly] = useState<boolean>(
    initial?.businessDaysOnly !== undefined ? initial.businessDaysOnly : true
  )
  const [endDate, setEndDate] = useState<string>(initial?.endDate || '')
  const [category, setCategory] = useState<string>(initial?.category || 'Controles')
  const [eventType, setEventType] = useState<string>(initial?.eventType || 'PCGC')
  const [offsetDays, setOffsetDays] = useState<number>(
    initial?.offsetDays !== undefined ? initial.offsetDays : -7
  )
  const [leadDays, setLeadDays] = useState<string>(
    initial?.leadDays !== undefined ? String(initial.leadDays) : ''
  )
  const [showTemplates, setShowTemplates] = useState(false)

  const applyTemplate = (t: ActivityTemplate) => {
    setName(t.name)
    setDescription(t.description || '')
    setFrequency(t.frequency)
    setIntervalVal(t.interval || 1)
    setBusinessDaysOnly(t.businessDaysOnly)
    setBranch(t.branch)
    setSplitBranches(t.splitBranches)
    setResponsible(t.responsible)
    setCategory(t.category || 'Controles')
    if (t.eventType) setEventType(t.eventType)
    if (t.offsetDays !== undefined) setOffsetDays(t.offsetDays)
    if (t.frequency === 'EVENTO') setShowAdvanced(true)
    setShowTemplates(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        interval: Math.max(1, Number(interval) || 1),
        startDate: startDate || today,
        endDate: endDate || undefined,
        effectiveFrom: initial?.effectiveFrom,
        businessDaysOnly: frequency === 'DIARIA' ? businessDaysOnly : false,
        branch,
        splitBranches: branch === 'AMBAS' ? splitBranches : false,
        responsible,
        category: category || undefined,
        eventType: frequency === 'EVENTO' ? eventType : undefined,
        offsetDays: frequency === 'EVENTO' ? Number(offsetDays) || 0 : undefined,
        leadDays: leadDays.trim() !== '' ? Math.max(0, Number(leadDays)) : undefined,
        state: initial?.state || 'ACTIVA',
        sourceNoteId: initial?.sourceNoteId,
        createdBy: initial?.createdBy || defaultRole
      },
      isEdit ? initial?.id : undefined
    )
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="composer-modal planner-modal" onSubmit={handleSubmit}>
        <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar">
          <X size={18} strokeWidth={2} />
        </button>

        <div className="planner-modal-top">
          <small className="modal-tag">
            {isEdit
              ? 'EDITAR ACTIVIDAD'
              : initial?.sourceNoteId
              ? 'CONVERTIR NOTA EN ACTIVIDAD'
              : 'NUEVA ACTIVIDAD'}
          </small>
          {!isEdit && (
            <button
              type="button"
              className="btn-template-toggle"
              onClick={() => setShowTemplates(s => !s)}
            >
              <Sparkles size={13} />
              <span>{showTemplates ? 'Ocultar ejemplos' : 'Usar ejemplo de Calidad'}</span>
            </button>
          )}
        </div>

        {showTemplates && (
          <div className="template-picker">
            <p className="template-picker-hint">
              Elegí una actividad habitual para completar el formulario y ajustala a tu medida:
            </p>
            <div className="template-picker-list">
              {SUGGESTED_TEMPLATES.map(t => (
                <button
                  type="button"
                  key={t.name}
                  className="template-picker-item"
                  onClick={() => applyTemplate(t)}
                >
                  <span className="template-picker-name">{t.name}</span>
                  <span className="template-picker-meta">
                    {FREQ_LABEL[t.frequency]} · {BRANCH_LABEL[t.branch]} · {ROLE_LABEL[t.responsible]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="form-block">
          <span className="form-label">Nombre de la actividad *</span>
          <input
            autoFocus
            required
            className="form-input form-input-lg"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej.: Control periódico de órdenes de reparación"
          />
        </label>

        <div className="form-grid-2">
          <label className="form-block">
            <span className="form-label">Frecuencia</span>
            <select
              className="form-select"
              value={frequency}
              onChange={e => {
                const f = e.target.value as Frequency
                setFrequency(f)
                if (f === 'EVENTO') setShowAdvanced(true)
              }}
            >
              {(Object.keys(FREQ_LABEL) as Frequency[]).map(f => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </label>

          {frequency !== 'EVENTO' ? (
            <label className="form-block">
              <span className="form-label">
                {frequency === 'UNICA' ? 'Fecha de vencimiento' : 'Fecha inicial / próxima'}
              </span>
              <input
                type="date"
                required
                className="form-input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </label>
          ) : (
            <label className="form-block">
              <span className="form-label">Evento que la activa</span>
              <select
                className="form-select"
                value={eventType}
                onChange={e => setEventType(e.target.value)}
              >
                {EVENT_TYPES.map(ev => (
                  <option key={ev.key} value={ev.key}>
                    {ev.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {frequency === 'EVENTO' && (
          <div className="form-event-offset">
            <span className="form-label">Cuándo realizarla respecto de la fecha real del evento:</span>
            <div className="offset-controls">
              <input
                type="number"
                className="form-input offset-number"
                value={Math.abs(offsetDays)}
                min={0}
                max={180}
                onChange={e => {
                  const val = Math.max(0, Number(e.target.value) || 0)
                  setOffsetDays(offsetDays < 0 ? -val : val)
                }}
              />
              <span>días</span>
              <div className="segmented-inline">
                <button
                  type="button"
                  className={offsetDays < 0 ? 'active' : ''}
                  onClick={() => setOffsetDays(-Math.max(1, Math.abs(offsetDays)))}
                >
                  Antes del evento
                </button>
                <button
                  type="button"
                  className={offsetDays === 0 ? 'active' : ''}
                  onClick={() => setOffsetDays(0)}
                >
                  El mismo día
                </button>
                <button
                  type="button"
                  className={offsetDays > 0 ? 'active' : ''}
                  onClick={() => setOffsetDays(Math.max(1, Math.abs(offsetDays)))}
                >
                  Después del evento
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="form-grid-2">
          <div className="form-block">
            <span className="form-label">Sucursal</span>
            <div className="segmented-control">
              {(['JUJUY', 'SALTA', 'AMBAS'] as BranchScope[]).map(b => (
                <button
                  type="button"
                  key={b}
                  className={branch === b ? 'active' : ''}
                  onClick={() => setBranch(b)}
                >
                  {b === 'AMBAS' ? 'Ambas' : BRANCH_LABEL[b]}
                </button>
              ))}
            </div>
            {branch === 'AMBAS' && (
              <label className="checkbox-inline" title="Permite marcar Jujuy realizado y Salta pendiente (o viceversa)">
                <input
                  type="checkbox"
                  checked={splitBranches}
                  onChange={e => setSplitBranches(e.target.checked)}
                />
                <span>Controlar Jujuy y Salta por separado</span>
              </label>
            )}
          </div>

          <div className="form-block">
            <span className="form-label">Responsable habitual</span>
            <div className="segmented-control">
              {(['RAC', 'ANALISTA'] as Role[]).map(r => (
                <button
                  type="button"
                  key={r}
                  className={responsible === r ? 'active' : ''}
                  onClick={() => setResponsible(r)}
                  title={ROLE_LONG[r]}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <small className="form-hint">
              Cada ejecución puede reasignarse sin cambiar el responsable habitual.
            </small>
          </div>
        </div>

        <label className="form-block">
          <span className="form-label">Descripción u orientación breve (opcional)</span>
          <textarea
            className="form-textarea"
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Qué revisar, criterio o recordatorio clave…"
          />
        </label>

        <button
          type="button"
          className="btn-advanced-toggle"
          onClick={() => setShowAdvanced(s => !s)}
        >
          <span>Opciones avanzadas</span>
          {showAdvanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showAdvanced && (
          <div className="advanced-box">
            <div className="form-grid-3">
              <label className="form-block">
                <span className="form-label">Área / Tipo</span>
                <select
                  className="form-select"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              {frequency !== 'UNICA' && frequency !== 'EVENTO' && (
                <label className="form-block">
                  <span className="form-label">Repetir cada</span>
                  <div className="inline-number-unit">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      className="form-input"
                      value={interval}
                      onChange={e => setIntervalVal(Math.max(1, Number(e.target.value) || 1))}
                    />
                    <span className="unit-label">
                      {frequency === 'DIARIA'
                        ? 'día(s)'
                        : frequency === 'SEMANAL'
                        ? 'semana(s)'
                        : frequency === 'MENSUAL'
                        ? 'mes(es)'
                        : frequency === 'TRIMESTRAL'
                        ? 'trim.'
                        : frequency === 'SEMESTRAL'
                        ? 'sem.'
                        : 'año(s)'}
                    </span>
                  </div>
                </label>
              )}

              <label className="form-block">
                <span className="form-label">Aviso previo (días)</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="form-input"
                  placeholder="Automático"
                  value={leadDays}
                  onChange={e => setLeadDays(e.target.value)}
                />
              </label>
            </div>

            {frequency === 'DIARIA' && (
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={businessDaysOnly}
                  onChange={e => setBusinessDaysOnly(e.target.checked)}
                />
                <span>Solo días hábiles (lunes a viernes)</span>
              </label>
            )}

            {frequency !== 'UNICA' && frequency !== 'EVENTO' && (
              <label className="form-block" style={{ marginTop: 8 }}>
                <span className="form-label">Finalizar repetición el (opcional)</span>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <div className="composer-bottom">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-modal-submit">
            <span>{isEdit ? 'Guardar cambios' : 'Guardar actividad'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

