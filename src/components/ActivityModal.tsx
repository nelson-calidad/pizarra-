import { useState } from 'react'
import { X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { Activity, BranchScope, Frequency, Role } from '../types'
import { addDays, parseISO, startOfWeek, todayISO, weekday } from '../lib/dates'
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

const WEEKDAY_OPTIONS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Lunes' },
  { dow: 2, label: 'Martes' },
  { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' },
  { dow: 5, label: 'Viernes' },
  { dow: 6, label: 'Sábado' },
  { dow: 0, label: 'Domingo' }
]

export function ActivityModal({ initial, isEdit, defaultRole = 'RAC', onSave, onClose }: Props) {
  const today = todayISO()
  const [name, setName] = useState(initial?.name || '')
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency || 'SEMANAL')
  const [branch, setBranch] = useState<BranchScope>(initial?.branch || 'AMBAS')
  const [splitBranches, setSplitBranches] = useState<boolean>(
    initial?.splitBranches !== undefined ? initial.splitBranches : true
  )
  const [responsible, setResponsible] = useState<Role>(initial?.responsible || defaultRole)
  const [startDate, setStartDate] = useState(initial?.startDate || today)

  // Semanal fija vs. flexible
  const [flexible, setFlexible] = useState<boolean>(Boolean(initial?.flexible))

  // Mensual con fecha fija vs. ventana de días (ej. del 7 al 10)
  const [useWindow, setUseWindow] = useState<boolean>(
    Boolean(initial?.windowStartDay && initial?.windowEndDay)
  )
  const [windowStartDay, setWindowStartDay] = useState<number>(initial?.windowStartDay || 7)
  const [windowEndDay, setWindowEndDay] = useState<number>(initial?.windowEndDay || 10)

  // Opciones avanzadas colapsadas por defecto
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      (initial?.interval && initial.interval > 1) ||
        initial?.endDate ||
        initial?.description
    )
  )
  const [description, setDescription] = useState(initial?.description || '')
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
  const [completionMode, setCompletionMode] = useState<import('../types').CompletionMode>(
    initial?.completionMode || 'CUALQUIERA'
  )
  const [completionLabel, setCompletionLabel] = useState<string>(initial?.completionLabel || '')
  const [showTemplates, setShowTemplates] = useState(false)

  const selectedDow = weekday(startDate || today)

  const selectWeekday = (targetDow: number) => {
    const mon = startOfWeek(startDate || today)
    const offset = targetDow === 0 ? 6 : targetDow - 1
    setStartDate(addDays(mon, offset))
  }

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
    setShowTemplates(false)
  }

  const supportsWindow =
    frequency === 'MENSUAL' ||
    frequency === 'TRIMESTRAL' ||
    frequency === 'SEMESTRAL' ||
    frequency === 'ANUAL'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const hasWin = supportsWindow && useWindow
    const wStart = hasWin ? Math.max(1, Math.min(31, Number(windowStartDay) || 1)) : undefined
    const wEnd = hasWin
      ? Math.max(wStart || 1, Math.min(31, Number(windowEndDay) || wStart || 1))
      : undefined

    onSave(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        frequency,
        interval: Math.max(1, Number(interval) || 1),
        startDate: startDate || today,
        endDate: endDate || undefined,
        effectiveFrom: initial?.effectiveFrom,
        businessDaysOnly:
          frequency === 'DIARIA' || supportsWindow ? businessDaysOnly : false,
        flexible: frequency === 'SEMANAL' ? flexible : undefined,
        windowStartDay: wStart,
        windowEndDay: wEnd,
        branch,
        splitBranches: branch === 'AMBAS' ? splitBranches : false,
        responsible,
        completionMode,
        completionLabel: completionLabel.trim() || undefined,
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
              <span>{showTemplates ? 'Ocultar ejemplos' : 'Ejemplos rápidos'}</span>
            </button>
          )}
        </div>

        {showTemplates && (
          <div className="template-picker">
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

        {/* 1. Nombre */}
        <label className="form-block">
          <span className="form-label">Nombre *</span>
          <input
            autoFocus
            required
            className="form-input form-input-lg"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej.: Recorrida de Taller Salta, Actualizar IPSOS…"
          />
        </label>

        {/* 2. Frecuencia + Día o ventana de ejecución */}
        <div className="form-grid-2">
          <label className="form-block">
            <span className="form-label">Frecuencia</span>
            <select
              className="form-select"
              value={frequency}
              onChange={e => setFrequency(e.target.value as Frequency)}
            >
              {(Object.keys(FREQ_LABEL) as Frequency[]).map(f => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </label>

          {frequency === 'SEMANAL' ? (
            <label className="form-block">
              <span className="form-label">
                {flexible ? 'Vence el día' : 'Día de ejecución'}
              </span>
              <select
                className="form-select"
                value={selectedDow}
                onChange={e => selectWeekday(Number(e.target.value))}
              >
                {WEEKDAY_OPTIONS.map(w => (
                  <option key={w.dow} value={w.dow}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          ) : frequency === 'DIARIA' ? (
            <div className="form-block">
              <span className="form-label">Días de ejecución</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={businessDaysOnly ? 'active' : ''}
                  onClick={() => setBusinessDaysOnly(true)}
                >
                  Lunes a viernes
                </button>
                <button
                  type="button"
                  className={!businessDaysOnly ? 'active' : ''}
                  onClick={() => setBusinessDaysOnly(false)}
                >
                  Todos los días
                </button>
              </div>
            </div>
          ) : frequency === 'EVENTO' ? (
            <label className="form-block">
              <span className="form-label">Evento vinculado</span>
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
          ) : (
            <label className="form-block">
              <span className="form-label">
                {frequency === 'UNICA' ? 'Fecha' : 'Fecha / mes inicial'}
              </span>
              <input
                type="date"
                required
                className="form-input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </label>
          )}
        </div>

        {/* Selector de modalidad para Semanal (Fija vs. Flexible de la semana) */}
        {frequency === 'SEMANAL' && (
          <div className="form-window-bar">
            <span className="form-label">Modalidad semanal:</span>
            <div className="segmented-control segmented-sm">
              <button
                type="button"
                className={!flexible ? 'active' : ''}
                onClick={() => setFlexible(false)}
              >
                Día fijo
              </button>
              <button
                type="button"
                className={flexible ? 'active' : ''}
                onClick={() => setFlexible(true)}
              >
                Flexible en la semana
              </button>
            </div>
          </div>
        )}

        {/* Selector de modalidad para Mensual / Trimestral (Fecha fija vs. Ventana de días, ej. del 7 al 10) */}
        {supportsWindow && (
          <div className="form-window-bar">
            <div className="segmented-control segmented-sm">
              <button
                type="button"
                className={!useWindow ? 'active' : ''}
                onClick={() => setUseWindow(false)}
              >
                Día fijo ({parseISO(startDate || today).d})
              </button>
              <button
                type="button"
                className={useWindow ? 'active' : ''}
                onClick={() => setUseWindow(true)}
              >
                Ventana de días (1 sola ejecución)
              </button>
            </div>

            {useWindow && (
              <div className="window-days-inputs">
                <span>Del día</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="form-input window-day-input"
                  value={windowStartDay}
                  onChange={e => setWindowStartDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                />
                <span>al</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="form-input window-day-input"
                  value={windowEndDay}
                  onChange={e => setWindowEndDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                />
              </div>
            )}
          </div>
        )}

        {frequency === 'EVENTO' && (
          <div className="form-event-offset">
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
                  Antes
                </button>
                <button
                  type="button"
                  className={offsetDays === 0 ? 'active' : ''}
                  onClick={() => setOffsetDays(0)}
                >
                  Mismo día
                </button>
                <button
                  type="button"
                  className={offsetDays > 0 ? 'active' : ''}
                  onClick={() => setOffsetDays(Math.max(1, Math.abs(offsetDays)))}
                >
                  Después
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Sucursal y Responsable habitual */}
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
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={splitBranches}
                  onChange={e => setSplitBranches(e.target.checked)}
                />
                <span>Cumplimiento separado Jujuy / Salta</span>
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
          </div>
        </div>

        {/* Modalidad de cumplimiento */}
        <div className="form-grid-2">
          <div className="form-block">
            <span className="form-label">Modalidad de cumplimiento</span>
            <div className="segmented-control">
              <button
                type="button"
                className={completionMode === 'CUALQUIERA' ? 'active' : ''}
                onClick={() => setCompletionMode('CUALQUIERA')}
                title="Cualquiera de los dos (1 clic)"
              >
                Cualquiera
              </button>
              <button
                type="button"
                className={completionMode === 'CONJUNTA' ? 'active' : ''}
                onClick={() => setCompletionMode('CONJUNTA')}
                title="Trabajo conjunto (RAC + Analista)"
              >
                Conjunta
              </button>
              <button
                type="button"
                className={completionMode === 'AMBOS_INDIVIDUAL' ? 'active' : ''}
                onClick={() => setCompletionMode('AMBOS_INDIVIDUAL')}
                title="Doble confirmación individual (1/2 y 2/2)"
              >
                Ambos
              </button>
            </div>
          </div>

          <label className="form-block">
            <span className="form-label">Verbo de acción (opcional)</span>
            <input
              className="form-input"
              value={completionLabel}
              onChange={e => setCompletionLabel(e.target.value)}
              placeholder="Auto (Ej: Revisado, Enviado, Hecho)"
            />
          </label>
        </div>

        {/* Opciones avanzadas opcionales */}
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
            <label className="form-block">
              <span className="form-label">Nota / orientación breve</span>
              <input
                className="form-input"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Opcional…"
              />
            </label>

            <div className="form-grid-3">
              <label className="form-block">
                <span className="form-label">Área</span>
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
                  <span className="form-label">Cada cuántas</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="form-input"
                    value={interval}
                    onChange={e => setIntervalVal(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
              )}

              <label className="form-block">
                <span className="form-label">Aviso previo (días)</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="form-input"
                  placeholder="Auto"
                  value={leadDays}
                  onChange={e => setLeadDays(e.target.value)}
                />
              </label>
            </div>

            {supportsWindow && !useWindow && (
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={businessDaysOnly}
                  onChange={e => setBusinessDaysOnly(e.target.checked)}
                />
                <span>Si cae fin de semana, pasar al día hábil</span>
              </label>
            )}

            {frequency !== 'UNICA' && frequency !== 'EVENTO' && (
              <div className="form-grid-2" style={{ marginTop: 8 }}>
                <label className="form-block">
                  <span className="form-label">Desde fecha</span>
                  <input
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </label>
                <label className="form-block">
                  <span className="form-label">Hasta fecha (opcional)</span>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </label>
              </div>
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
