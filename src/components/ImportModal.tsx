import { useState, useRef } from 'react'
import {
  Upload, X, CheckSquare, AlertTriangle,
  Building, User, Check, ShieldAlert, FileText
} from 'lucide-react'
import type { Activity, Role } from '../types'
import {
  parseImportDraft, buildActivitiesFromParsed,
  type ParsedImportItem
} from '../lib/importCatalog'
import { BRANCH_LABEL, ROLE_LABEL } from '../lib/labels'
import { todayISO } from '../lib/dates'

type Props = {
  existingActivities: Activity[]
  currentUser: Role
  onImport: (activities: Activity[]) => void
  onClose: () => void
}

export function ImportModal({
  existingActivities,
  currentUser,
  onImport,
  onClose
}: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload')
  const [parsedItems, setParsedItems] = useState<ParsedImportItem[]>([])
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [effectiveStartDate, setEffectiveStartDate] = useState(todayISO())
  const [importSummary, setImportSummary] = useState<{ count: number; skipped: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Manejo de lectura de archivo JSON
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = event => {
      const content = String(event.target?.result || '')
      processContent(content)
    }
    reader.readAsText(file, 'utf-8')
  }

  const processContent = (content: string) => {
    const items = parseImportDraft(content, effectiveStartDate)
    setParsedItems(items)

    // Por defecto, preseleccionar las válidas y NO excluidas
    const initialSelected = new Set<string>()
    items.forEach(it => {
      if (!it.isExcluded) {
        initialSelected.add(it.importId)
      }
    })
    setSelectedCodes(initialSelected)
    setStep('preview')
  }

  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleSelectAll = (select: boolean) => {
    if (select) {
      setSelectedCodes(new Set(parsedItems.filter(i => !i.isExcluded).map(i => i.importId)))
    } else {
      setSelectedCodes(new Set())
    }
  }

  // Filtrar y agrupar por frecuencia
  const grouped = {
    DIARIA: parsedItems.filter(i => i.frequency === 'DIARIA'),
    SEMANAL: parsedItems.filter(i => i.frequency === 'SEMANAL'),
    MENSUAL: parsedItems.filter(i => i.frequency === 'MENSUAL'),
    SEMESTRAL: parsedItems.filter(i => i.frequency === 'SEMESTRAL'),
    EVENTO: parsedItems.filter(i => i.frequency === 'EVENTO'),
    UNICA: parsedItems.filter(i => i.frequency === 'UNICA')
  }

  const handleConfirmImport = () => {
    const chosen = parsedItems.filter(i => selectedCodes.has(i.importId) && !i.isExcluded)
    const { toInsert, skippedCount } = buildActivitiesFromParsed(
      chosen,
      existingActivities,
      currentUser
    )

    onImport(toInsert)
    setImportSummary({ count: toInsert.length, skipped: skippedCount })
    setStep('success')
  }

  // Identificar si una actividad ya existe en el sistema actual
  const existingCodeSet = new Set(
    existingActivities.map(a => (a.importId || '').toUpperCase()).filter(Boolean)
  )
  const existingNameSet = new Set(
    existingActivities.map(a => a.name.trim().toLowerCase())
  )

  const isAlreadyImported = (it: ParsedImportItem) =>
    existingCodeSet.has(it.importId.toUpperCase()) ||
    existingNameSet.has(it.name.trim().toLowerCase())

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="import-modal-card">
        <div className="import-modal-head">
          <div className="import-head-title">
            <Upload size={18} className="head-icon" />
            <div>
              <h3>Importación de Catálogo de Calidad Autosol</h3>
              <p>Carga masiva estructurada con detección de duplicados y revisión de borrador</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        {step === 'upload' && (
          <div className="import-upload-pane">
            <div
              className="upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText size={38} className="dropzone-icon" />
              <h4>Seleccionar archivo JSON de actividades</h4>
              <p>
                Hacé clic aquí para elegir <code>catalogo_autosol_actividades_borrador.json</code>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <span className="btn-secondary btn-sm" style={{ marginTop: 10 }}>
                Examinar archivo...
              </span>
            </div>

            <div className="import-notice-box">
              <ShieldAlert size={16} className="notice-icon" />
              <div className="notice-text">
                <b>Reglas de protección aplicadas en la importación:</b>
                <ul>
                  <li>
                    <b>Detección de duplicados:</b> si una actividad ya fue cargada, no se duplica ni se sobreescribe su historial.
                  </li>
                  <li>
                    <b>Detalles pendientes:</b> actividades marcadas con <code>[REVISAR]</code> quedan en estado <i>Pausada</i> para no saturar <i>Hoy</i>.
                  </li>
                  <li>
                    <b>Exclusiones directas:</b> Mystery Shopper (suspendido) y controles de órdenes semanales (solo a demanda) se omiten.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="import-preview-pane">
            <div className="preview-top-toolbar">
              <div className="preview-counts-summary">
                <span className="summary-chip">
                  Total en archivo: <b>{parsedItems.length}</b>
                </span>
                <span className="summary-chip chip-selected">
                  Seleccionadas: <b>{selectedCodes.size}</b>
                </span>
                <span className="summary-chip chip-warning">
                  Pendientes de confirmación: <b>{parsedItems.filter(i => i.hasPendingDetails).length}</b>
                </span>
              </div>

              <div className="preview-actions-bar">
                <button
                  type="button"
                  className="btn-link-xs"
                  onClick={() => toggleSelectAll(true)}
                >
                  Seleccionar todas válidas
                </button>
                <button
                  type="button"
                  className="btn-link-xs"
                  onClick={() => toggleSelectAll(false)}
                >
                  Deseleccionar todas
                </button>
                <label className="effective-date-label">
                  <span>Vigente desde:</span>
                  <input
                    type="date"
                    className="form-input form-input-sm"
                    value={effectiveStartDate}
                    onChange={e => {
                      setEffectiveStartDate(e.target.value)
                      // Recalcular fechas base
                      setParsedItems(prev =>
                        prev.map(it => ({ ...it, startDate: it.startDate < e.target.value ? e.target.value : it.startDate }))
                      )
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Listado agrupado por frecuencia */}
            <div className="preview-groups-scroll">
              {(
                [
                  ['DIARIA', 'Diarias', grouped.DIARIA],
                  ['SEMANAL', 'Semanales', grouped.SEMANAL],
                  ['MENSUAL', 'Mensuales', grouped.MENSUAL],
                  ['SEMESTRAL', 'Semestrales / Anuales', grouped.SEMESTRAL],
                  ['EVENTO', 'Vinculadas a Eventos (PCGC, ISO, Cierres)', grouped.EVENTO],
                  ['UNICA', 'Puntuales / A demanda', grouped.UNICA]
                ] as const
              ).map(([freqKey, label, items]) => {
                if (items.length === 0) return null
                return (
                  <div key={freqKey} className="preview-group-section">
                    <div className="preview-group-header">
                      <span className="group-title">{label}</span>
                      <span className="group-badge">{items.length}</span>
                    </div>

                    <div className="preview-items-list">
                      {items.map(item => {
                        const isDup = isAlreadyImported(item)
                        const isChecked = selectedCodes.has(item.importId) && !item.isExcluded

                        return (
                          <div
                            key={item.importId}
                            className={`preview-item-row ${
                              item.isExcluded
                                ? 'item-excluded'
                                : isDup
                                ? 'item-duplicate'
                                : item.hasPendingDetails
                                ? 'item-pending-review'
                                : ''
                            }`}
                          >
                            <label className="item-checkbox-wrap">
                              <input
                                type="checkbox"
                                disabled={item.isExcluded || isDup}
                                checked={isChecked}
                                onChange={() => toggleSelect(item.importId)}
                              />
                              <span className="item-code-tag">{item.importId}</span>
                            </label>

                            <div className="item-main-details">
                              <div className="item-title-line">
                                <b className="item-title">{item.name}</b>
                                {item.isExcluded ? (
                                  <span className="status-pill pill-danger">
                                    Omitida: {item.exclusionReason}
                                  </span>
                                ) : isDup ? (
                                  <span className="status-pill pill-duplicate">
                                    Ya existente en el catálogo (no se duplicará)
                                  </span>
                                ) : item.hasPendingDetails ? (
                                  <span className="status-pill pill-warning" title={item.pendingReason}>
                                    <AlertTriangle size={12} /> {item.pendingReason || 'Pendiente de confirmación (se importará pausada)'}
                                  </span>
                                ) : (
                                  <span className="status-pill pill-active">
                                    <Check size={12} /> Confirmada (activa)
                                  </span>
                                )}
                              </div>

                              <div className="item-meta-tags">
                                <span className="meta-tag">
                                  <Building size={11} /> {BRANCH_LABEL[item.branch]} {item.splitBranches ? '(independiente Jujuy/Salta)' : ''}
                                </span>
                                <span className="meta-tag">
                                  <User size={11} /> Hab: {ROLE_LABEL[item.responsible]}
                                </span>
                                {item.windowStartDay && item.windowEndDay && (
                                  <span className="meta-tag tag-window">
                                    Ventana del {item.windowStartDay} al {item.windowEndDay}
                                  </span>
                                )}
                                {item.eventType && (
                                  <span className="meta-tag tag-event">
                                    Evento {item.eventType} ({item.offsetDays !== undefined && item.offsetDays > 0 ? `+${item.offsetDays}` : item.offsetDays}d)
                                  </span>
                                )}
                                {item.flexible && (
                                  <span className="meta-tag tag-flex">
                                    Flexible semanal
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="preview-footer-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep('upload')}
              >
                Volver a elegir archivo
              </button>
              <div className="footer-right-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-new-note"
                  disabled={selectedCodes.size === 0}
                  onClick={handleConfirmImport}
                >
                  <CheckSquare size={16} />
                  <span>Importar {selectedCodes.size} actividades</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'success' && importSummary && (
          <div className="import-success-pane">
            <div className="success-icon-wrap">
              <Check size={42} strokeWidth={2.5} />
            </div>
            <h3>¡Importación completada!</h3>
            <p>
              Se incorporaron <b>{importSummary.count}</b> actividades al catálogo.
              {importSummary.skipped > 0 && ` Se omitieron ${importSummary.skipped} actividades por estar duplicadas o excluidas.`}
            </p>
            <p className="success-subnote">
              Las actividades con detalles pendientes quedaron en estado <b>Pausada</b> para que no generen falsos vencimientos hasta que confirmes sus fechas definitivas.
            </p>
            <button
              type="button"
              className="btn-new-note"
              style={{ marginTop: 16 }}
              onClick={onClose}
            >
              Ver en el Catálogo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
