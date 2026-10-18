import { useState, type FormEvent } from 'react'
import { KeyRound, LogIn, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react'
import type { Role } from '../types'
import { login } from '../services/sheetsApi'

type Props = {
  onLoginSuccess: (user: Role) => void
  initialUser?: Role
}

export function LoginModal({ onLoginSuccess, initialUser = 'RAC' }: Props) {
  const [user, setUser] = useState<Role>(initialUser)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('Por favor ingresá la contraseña.')
      return
    }

    setLoading(true)
    setError('')

    const res = await login(user, password.trim())
    setLoading(false)

    if (res.success && res.user) {
      onLoginSuccess(res.user)
    } else {
      setError(res.error || 'Contraseña incorrecta o error de verificación.')
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-card" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="login-header">
          <div className="login-brand-logo">A</div>
          <h2 id="login-title" className="login-title">Mi Tablero Autosol</h2>
          <p className="login-subtitle">Departamento de Calidad, Ambiente y Procesos</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-user-select-group">
            <label className="login-label">Seleccionar operador:</label>
            <div className="login-user-pills">
              <button
                type="button"
                className={`login-user-pill ${user === 'RAC' ? 'active' : ''}`}
                onClick={() => { setUser('RAC'); setError('') }}
              >
                <span className="user-disc">R</span>
                <div className="user-info-text">
                  <span className="user-role-name">RAC</span>
                  <span className="user-role-sub">Resp. de Calidad</span>
                </div>
              </button>

              <button
                type="button"
                className={`login-user-pill ${user === 'ANALISTA' ? 'active' : ''}`}
                onClick={() => { setUser('ANALISTA'); setError('') }}
              >
                <span className="user-disc">A</span>
                <div className="user-info-text">
                  <span className="user-role-name">Analista</span>
                  <span className="user-role-sub">Analista de Calidad</span>
                </div>
              </button>
            </div>
          </div>

          <div className="login-input-group">
            <label htmlFor="login-password" className="login-label">
              Contraseña de {user === 'RAC' ? 'RAC' : 'Analista'}:
            </label>
            <div className="login-password-wrap">
              <KeyRound size={16} className="login-input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="Ingresá tu contraseña…"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword(s => !s)}
                tabIndex={-1}
                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error-banner" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="login-actions">
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || !password.trim()}
            >
              {loading ? (
                <span>Verificando…</span>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Ingresar como {user === 'RAC' ? 'RAC' : 'Analista'}</span>
                </>
              )}
            </button>
          </div>

          <div className="login-footer-hint">
            <ShieldCheck size={13} />
            <span>Acceso seguro protegido en Google Apps Script</span>
          </div>
        </form>
      </div>
    </div>
  )
}

