import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó un error no controlado:', error, errorInfo)
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('mi-tablero-notes')
    } catch {
      // Ignore
    }
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f8fafc',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#1e293b',
          textAlign: 'center'
        }}>
          <div style={{
            background: '#ffffff',
            padding: '36px 32px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            maxWidth: '480px',
            width: '100%',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: '#fef2f2',
              color: '#ef4444',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
              fontSize: '24px'
            }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>
              Ocurrió un error al cargar
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: '0 0 20px' }}>
              Se protegió la aplicación de una pantalla en blanco. Podés recargar la ventana para reintentar la sincronización.
            </p>
            {this.state.error?.message && (
              <div style={{
                background: '#f1f5f9',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#475569',
                fontFamily: 'monospace',
                marginBottom: '20px',
                textAlign: 'left',
                overflowX: 'auto'
              }}>
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#5e54f0',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Recargar página
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Limpiar caché y recargar
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

