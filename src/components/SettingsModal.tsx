import { useState } from 'react'
import { X, RefreshCw, Download, ShieldCheck, AlertCircle, Check } from 'lucide-react'
import {
  discardFailed, getAccessKey, getApiUrl, getFailedOps, retryFailed, retryNow, setConnection,
  type SyncSnapshot
} from '../services/sheetsApi'
import type { Activity, Execution, Note, PlannerEvent, Role } from '../types'
import { ROLE_LONG } from '../lib/labels'

type Props = {
  sync: SyncSnapshot
  currentUser: Role
  onChangeCurrentUser: (r: Role) => void
  notes: Note[]
  activities: Activity[]
  executions: Execution[]
  events: PlannerEvent[]
  onClose: () => void
  onSyncLocalToRemote?: () => void
}

export function SettingsModal({
  sync,
  currentUser,
  onChangeCurrentUser,
  notes,
  activities,
  executions,
  events,
  onClose,
  onSyncLocalToRemote
}: Props) {
  const [url, setUrl] = useState(getApiUrl())
  const [key, setKey] = useState(getAccessKey())
  const [savedMsg, setSavedMsg] = useState(false)
  const failedOps = getFailedOps()

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setConnection(url, key)
    if (url.trim()) {
      onSyncLocalToRemote?.()
    }
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2500)
  }

  const exportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      notes,
      activities,
      executions,
      events
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `respaldo-calidad-autosol-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="composer-modal planner-modal">
        <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar">
          <X size={18} strokeWidth={2} />
        </button>

        <small className="modal-tag">CONFIGURACIÓN Y SINCRONIZACIÓN COMPARTIDA</small>

        <div className="form-block" style={{ marginTop: 10 }}>
          <span className="form-label">¿Con qué rol operás desde este navegador?</span>
          <div className="segmented-control">
            <button
              type="button"
              className={currentUser === 'RAC' ? 'active' : ''}
              onClick={() => onChangeCurrentUser('RAC')}
            >
              👤 RAC ({ROLE_LONG.RAC})
            </button>
            <button
              type="button"
              className={currentUser === 'ANALISTA' ? 'active' : ''}
              onClick={() => onChangeCurrentUser('ANALISTA')}
            >
              👤 Analista ({ROLE_LONG.ANALISTA})
            </button>
          </div>
          <small className="form-hint">
            Se usa para registrar automáticamente quién completó una actividad en 1 clic.
          </small>
        </div>

        <form onSubmit={handleSave} className="settings-connection-box">
          <span className="detail-section-title">Conexión con Google Sheets (Apps Script)</span>
          <label className="form-block">
            <span className="form-label">URL de la aplicación web de Apps Script</span>
            <input
              className="form-input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
            />
          </label>

          <label className="form-block" style={{ marginTop: 8 }}>
            <span className="form-label">
              <ShieldCheck size={13} style={{ verticalAlign: 'middle' }} /> Clave de acceso compartida (opcional)
            </span>
            <input
              type="password"
              className="form-input"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Si definiste ACCESS_KEY en la hoja CONFIG, ingresala aquí"
            />
            <small className="form-hint">
              Nunca se guarda en el código fuente: queda solo en este navegador.
            </small>
          </label>

          <div className="drawer-actions" style={{ marginTop: 12 }}>
            <button type="submit" className="btn-primary-sm">
              {savedMsg ? (
                <>
                  <Check size={13} /> Guardado y sincronizando
                </>
              ) : (
                'Guardar conexión'
              )}
            </button>
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={() => {
                onSyncLocalToRemote?.()
                retryNow()
              }}
              title="Sube las actividades y notas locales a Google Sheets"
            >
              <RefreshCw size={13} /> Sincronizar ahora
            </button>
          </div>
        </form>

        {/* Estado real de la cola */}
        <div className="settings-status-card">
          <div className="settings-status-line">
            <span>Estado actual:</span>
            <b>
              {sync.status === 'idle' && 'Sincronizado con Google Sheets'}
              {sync.status === 'local' && 'Modo local (sin URL de Google Sheets configurada)'}
              {sync.status === 'saving' && `Guardando en Google Sheets (${sync.pending} pendiente/s)…`}
              {sync.status === 'pending' && `${sync.pending} cambio/s pendiente/s de confirmar`}
              {sync.status === 'offline' && `Sin conexión (${sync.pending} cambio/s en cola local)`}
              {sync.status === 'auth' && 'Clave de acceso rechazada por Google Sheets (401)'}
              {sync.status === 'error' && `Atención: error al sincronizar`}
            </b>
          </div>

          {sync.status === 'local' && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e', lineHeight: 1.4 }}>
              <b>📌 Modo Guardado Local activo:</b> Tus {activities.length} actividades están guardadas en este navegador. Para subirlas a Google Sheets, ingresá arriba la URL de tu Web App de Apps Script y hacé clic en <b>Guardar conexión</b>.
            </div>
          )}

          {activities.length > 0 && sync.status !== 'local' && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Catálogo local: {activities.length} actividades</span>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => {
                  onSyncLocalToRemote?.()
                  retryNow()
                }}
              >
                <RefreshCw size={12} /> Subir {activities.length} act. a Sheets
              </button>
            </div>
          )}
          {sync.lastError && (
            <div className="settings-error-msg">
              <AlertCircle size={13} />
              <span>{sync.lastError}</span>
            </div>
          )}
          {failedOps.length > 0 && (
            <div className="settings-failed-box">
              <span>{failedOps.length} operación(es) apartada(s) tras varios intentos.</span>
              <div className="drawer-actions">
                <button type="button" className="btn-primary-sm" onClick={retryFailed}>
                  Reintentar
                </button>
                <button type="button" className="btn-secondary-sm" onClick={discardFailed}>
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Respaldo local */}
        <div className="composer-bottom" style={{ marginTop: 14 }}>
          <button type="button" className="btn-secondary" onClick={exportBackup}>
            <Download size={15} />
            <span>Descargar respaldo JSON ({notes.length} notas, {activities.length} act.)</span>
          </button>
          <button type="button" className="btn-modal-submit" onClick={onClose}>
            <span>Cerrar</span>
          </button>
        </div>
      </div>
    </div>
  )
}

