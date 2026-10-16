import { useEffect, useRef, useState } from 'react'
import {
  LayoutGrid, Pin, RotateCcw, Check, X, AlertCircle, Trash2, Edit3, Archive,
  User, Users, Copy, Focus, Navigation, ArrowUpRight, History
} from 'lucide-react'
import type { Note, ChecklistItem, ActivityEntry } from '../types'
import { enqueue, fetchActivity, fetchChecklist, toSheet } from '../services/sheetsApi'
import { addDays } from '../lib/dates'

export const isNoteOverdue = (n: Note, today: string) =>
  n.status === 'PENDIENTE' && !!n.date && n.date < today

export const formatNoteDateLabel = (d: string | undefined, today: string) => {
  if (!d) return 'Sin fecha'
  const clean = d.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : d
  const tomorrow = addDays(today, 1)
  if (clean === today) return 'Hoy'
  if (clean === tomorrow) return 'Mañana'
  try {
    const dt = new Date(clean + 'T12:00:00')
    if (isNaN(dt.getTime())) return clean
    return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(dt)
  } catch {
    return clean
  }
}

type BoardProps = {
  notes: Note[]
  allMemberNotes: Note[]
  archivedCount: number
  today: string
  filter: string
  setFilter: (f: string) => void
  counts: number[]
  query: string
  setQuery: (q: string) => void
  update: (id: string, data: Partial<Note>) => void
  removeNote: (id: string) => void
  select: (n: Note) => void
  onConvertToActivity: (n: Note) => void
  people: string[]
  activeMember: string
  setActiveMember: (m: string) => void
}

export function BoardSection({
  notes,
  archivedCount,
  today,
  filter,
  setFilter,
  counts,
  query,
  setQuery,
  update,
  removeNote,
  select,
  onConvertToActivity,
  people,
  activeMember,
  setActiveMember
}: BoardProps) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const filterList = [
    { key: 'Pendientes', count: counts[1] },
    { key: 'Hoy', count: counts[2] },
    { key: 'Vencidos', count: counts[3] },
    { key: 'Fijadas', count: counts[4] },
    { key: 'Todos', count: counts[0] },
    { key: 'Hechos', count: counts[5] },
    { key: 'Archivados', count: archivedCount }
  ]

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.05 : -0.05
      setScale(s => Math.min(1.4, Math.max(0.7, Number((s + delta).toFixed(2)))))
    } else {
      setPan(p => ({
        x: Math.max(-1200, Math.min(1200, p.x - e.deltaX)),
        y: Math.max(-1000, Math.min(1000, p.y - e.deltaY))
      }))
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.card, button, select, input, textarea, .toolbar')) return
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!panStart.current || !isPanning) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({
      x: Math.max(-1400, Math.min(1400, panStart.current.panX + dx)),
      y: Math.max(-1200, Math.min(1200, panStart.current.panY + dy))
    })
  }

  const handlePointerUp = () => {
    panStart.current = null
    setIsPanning(false)
  }

  const centerTasks = () => {
    setScale(1)
    if (notes.length === 0) {
      setPan({ x: 0, y: 0 })
      return
    }
    const avgX = notes.reduce((acc: number, n: Note) => acc + (n.x || 120), 0) / notes.length
    const avgY = notes.reduce((acc: number, n: Note) => acc + (n.y || 120), 0) / notes.length
    const rect = containerRef.current?.getBoundingClientRect()
    const targetW = rect ? rect.width : 900
    const targetH = rect ? rect.height : 600
    setPan({
      x: Math.round(targetW / 2 - avgX - 130),
      y: Math.round(targetH / 2 - avgY - 80)
    })
  }

  const focusNote = (n: Note) => {
    setScale(1)
    const rect = containerRef.current?.getBoundingClientRect()
    const targetW = rect ? rect.width : 900
    const targetH = rect ? rect.height : 600
    setPan({
      x: Math.round(targetW / 2 - n.x - 130),
      y: Math.round(targetH / 2 - n.y - 80)
    })
  }

  return (
    <section className="board-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="filter-chips">
            {filterList.map(item => (
              <button
                className={`filter-chip ${filter === item.key && !showActivityLog ? 'chosen' : ''}`}
                onClick={() => {
                  setShowActivityLog(false)
                  setFilter(item.key)
                }}
                key={item.key}
              >
                <span>{item.key}</span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span
                    className={`chip-badge ${
                      item.key === 'Vencidos' && item.count > 0 ? 'badge-danger' : ''
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              className={`filter-chip ${showActivityLog ? 'chosen' : ''}`}
              onClick={() => setShowActivityLog(s => !s)}
              title="Ver historial de movimientos de notas"
            >
              <History size={12} />
              <span>Historial</span>
            </button>
          </div>

          {query && (
            <div className="active-filter-badge" title="Filtro activo">
              <span>
                Filtro: <b>{query}</b>
              </span>
              <button onClick={() => setQuery('')} title="Quitar filtro">
                <X size={12} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>

        {!showActivityLog && notes.length > 0 && (
          <div className="toolbar-quick-notes">
            <span className="quick-notes-label">Ir a nota:</span>
            <div className="quick-notes-chips">
              {notes.slice(0, 6).map((n: Note) => (
                <button
                  key={n.id}
                  className="quick-note-btn"
                  onClick={() => focusNote(n)}
                  title={`Centrar "${n.text}"`}
                >
                  <Navigation size={11} strokeWidth={2.4} />
                  <span>
                    {n.text.slice(0, 18)}
                    {n.text.length > 18 ? '…' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showActivityLog ? (
        <BoardActivityLog />
      ) : (
        <div
          className={`board-wrapper ${isPanning ? 'is-panning' : ''}`}
          ref={containerRef}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="canvas-zoom-control">
            <button
              className="zoom-btn"
              onClick={() => setScale(s => Math.max(0.7, Number((s - 0.1).toFixed(2))))}
              title="Alejar (Ctrl + Rueda abajo)"
            >
              −
            </button>
            <button
              className="zoom-value"
              onClick={() => {
                setScale(1)
                setPan({ x: 0, y: 0 })
              }}
              title="Restablecer tamaño normal (100%)"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              className="zoom-btn"
              onClick={() => setScale(s => Math.min(1.4, Number((s + 0.1).toFixed(2))))}
              title="Acercar (Ctrl + Rueda arriba)"
            >
              +
            </button>
            <button
              className="zoom-btn-center"
              onClick={centerTasks}
              title="Centrar y ver todas las notas"
            >
              <Focus size={13} strokeWidth={2.2} />
              <span>Centrar</span>
            </button>
          </div>

          <div
            ref={boardRef}
            className="board-canvas"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              transition: isPanning ? 'none' : 'transform 120ms ease-out'
            }}
          >
            {notes.length ? (
              notes.map((n: Note) => (
                <NoteCard
                  note={n}
                  today={today}
                  update={update}
                  removeNote={removeNote}
                  select={select}
                  onConvertToActivity={onConvertToActivity}
                  people={people}
                  scale={scale}
                  key={n.id}
                />
              ))
            ) : (
              <div className="empty" style={{ pointerEvents: 'auto' }}>
                <div className="empty-icon-wrap">
                  <LayoutGrid size={32} strokeWidth={1.6} />
                </div>
                <h2>
                  {activeMember !== 'Todos'
                    ? `No hay notas asignadas a ${activeMember}`
                    : query || filter !== 'Todos'
                    ? 'No hay notas con este filtro'
                    : 'Tu pizarrón está vacío'}
                </h2>
                <p>
                  {activeMember !== 'Todos'
                    ? 'Las notas sin responsable aparecen en el espacio General.'
                    : query || filter !== 'Todos'
                    ? 'Probá cambiando la categoría o el filtro seleccionado.'
                    : 'Anotá rápidamente recordatorios espontáneos, ideas o avisos.'}
                </p>
                {activeMember !== 'Todos' && (
                  <button
                    className="btn-empty-switch"
                    onClick={() => setActiveMember('Todos')}
                  >
                    <Users size={14} strokeWidth={2} />
                    <span>Ver todas las notas (General)</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function NoteCard({
  note,
  today,
  update,
  removeNote,
  select,
  onConvertToActivity,
  people,
  scale = 1
}: {
  note: Note
  today: string
  update: (id: string, data: Partial<Note>) => void
  removeNote: (id: string) => void
  select: (n: Note) => void
  onConvertToActivity: (n: Note) => void
  people: string[]
  scale?: number
}) {
  const start = useRef<{ x: number; y: number; l: number; t: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [localPos, setLocalPos] = useState({ x: note.x, y: note.y })
  const [showAssign, setShowAssign] = useState(false)

  useEffect(() => {
    setLocalPos({ x: note.x, y: note.y })
  }, [note.x, note.y])

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select')) return
    start.current = { x: e.clientX, y: e.clientY, l: note.x, t: note.y }
    setIsDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.stopPropagation()
  }

  const move = (e: React.PointerEvent) => {
    if (!start.current) return
    const currentScale = scale || 1
    setLocalPos({
      x: Math.max(0, start.current.l + (e.clientX - start.current.x) / currentScale),
      y: Math.max(0, start.current.t + (e.clientY - start.current.y) / currentScale)
    })
  }

  const up = () => {
    if (start.current && isDragging) {
      update(note.id, { x: Math.round(localPos.x), y: Math.round(localPos.y) })
    }
    start.current = null
    setIsDragging(false)
  }

  const isOverdue = isNoteOverdue(note, today)

  return (
    <article
      className={`card ${note.color} ${note.status === 'HECHO' ? 'done' : ''} ${
        note.pinned ? 'is-pinned' : ''
      } ${isDragging ? 'dragging' : ''}`}
      style={{ left: localPos.x, top: localPos.y, width: note.width, minHeight: note.height }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onDoubleClick={() => select(note)}
    >
      <div className="cardtop">
        <div className="card-badge-row">
          <span className={`priority-pill priority-${note.priority.toLowerCase()}`}>
            <b className={`prio-dot ${note.priority}`} />
            {note.priority}
          </span>
          <span className="category-pill">{note.category}</span>
          {showAssign ? (
            <select
              autoFocus
              className="card-assignee-select"
              value={note.assignee || ''}
              onChange={e => {
                update(note.id, { assignee: e.target.value || undefined })
                setShowAssign(false)
              }}
              onBlur={() => setShowAssign(false)}
              onClick={e => e.stopPropagation()}
            >
              <option value="">Sin asignar</option>
              {(people || []).map((p: string) => (
                <option value={p} key={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <button
              className={`assignee-pill assignee-pill-btn ${
                note.assignee ? '' : 'assignee-pill-empty'
              }`}
              title="Clic para asignar persona"
              onClick={e => {
                e.stopPropagation()
                setShowAssign(true)
              }}
            >
              <User size={11} strokeWidth={2} />
              <span>{note.assignee || 'Sin asignar'}</span>
            </button>
          )}
        </div>
        {note.pinned && (
          <span className="pin-badge" title="Nota fijada">
            <Pin size={12} strokeWidth={2.4} />
          </span>
        )}
      </div>

      <h3 className="card-title">{note.text}</h3>

      <div className="card-meta">
        {(note.date || note.time) && (
          <span className={`date-badge ${isOverdue ? 'date-overdue' : ''}`}>
            {isOverdue && <AlertCircle size={12} strokeWidth={2.2} />}
            <span>{isOverdue ? 'Vencida' : formatNoteDateLabel(note.date, today)}</span>
            {note.time && <span className="meta-time">· {note.time}</span>}
          </span>
        )}
        {note.checklistCount && note.checklistCount > 0 ? (
          <span className="checklist-indicator">
            <Check size={11} /> {note.checklistDone || 0}/{note.checklistCount}
          </span>
        ) : null}
      </div>

      <div className="actions">
        <button
          className="btn-action-status"
          onClick={() =>
            update(note.id, {
              status: note.status === 'HECHO' ? 'PENDIENTE' : 'HECHO',
              completedAt: note.status === 'HECHO' ? undefined : new Date().toISOString()
            })
          }
        >
          {note.status === 'HECHO' ? (
            <>
              <RotateCcw size={12} strokeWidth={2} /> Reabrir
            </>
          ) : (
            <>
              <Check size={13} strokeWidth={2.4} /> Hecho
            </>
          )}
        </button>
        <div className="actions-right">
          {/* Opción discreta: Convertir en actividad */}
          <button
            className="btn-action-icon"
            onClick={() => onConvertToActivity(note)}
            title="Convertir en actividad operativa"
          >
            <ArrowUpRight size={13} strokeWidth={2.2} />
          </button>
          <button className="btn-action-icon" onClick={() => select(note)} title="Editar nota">
            <Edit3 size={13} strokeWidth={2} />
          </button>
          <button
            className="btn-action-icon btn-action-delete"
            onClick={() => {
              if (window.confirm('¿Seguro que querés eliminar esta nota?')) {
                removeNote(note.id)
              }
            }}
            title="Eliminar nota"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </article>
  )
}

function BoardActivityLog() {
  const [list, setList] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivity()
      .then(data => {
        setList(data.slice().reverse())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px 38px', overflowY: 'auto' }}>
      <div
        style={{
          maxWidth: 720,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          padding: '24px'
        }}
      >
        <h3 style={{ marginTop: 0 }}>Historial de notas</h3>
        {loading ? (
          <p className="nothing">Cargando actividad…</p>
        ) : list.length === 0 ? (
          <p className="nothing">No hay actividad registrada por el momento.</p>
        ) : (
          <div className="activity-timeline">
            {list.map(a => (
              <div className="activity-item" key={a.id}>
                <span className="activity-dot" />
                <div className="activity-text">
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {a.actor || 'Sistema'}
                  </span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{a.action}</span>{' '}
                  <span style={{ fontWeight: 500, color: 'var(--accent)' }}>{a.detail}</span>
                  <div className="activity-date">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function NoteDetail({
  note,
  update,
  removeNote,
  archiveNote,
  onConvertToActivity,
  people,
  addPerson,
  close,
  setNotes
}: {
  note: Note
  update: (id: string, data: Partial<Note>) => void
  removeNote: (id: string) => void
  archiveNote: (id: string) => void
  onConvertToActivity: (n: Note) => void
  people: string[]
  addPerson: (name: string) => void
  close: () => void
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>
}) {
  const [f, setF] = useState(note)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [items, setItems] = useState<ChecklistItem[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [newChecklist, setNewChecklist] = useState('')

  useEffect(() => {
    setF(note)
    fetchChecklist(note.id).then(setItems).catch(() => {})
    fetchActivity(note.id).then(setActivity).catch(() => {})
  }, [note])

  const save = (x: Partial<Note>) => {
    setF(old => ({ ...old, ...x }))
    setSaveStatus('saving')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      update(note.id, x)
      setSaveStatus('saved')
    }, 350)
  }

  const colors = ['yellow', 'blue', 'green', 'rose', 'violet']

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-left">
          <small className="modal-tag">DETALLE DE NOTA</small>
          <span
            className={`save-badge ${
              saveStatus === 'saving' ? 'save-badge-saving' : 'save-badge-saved'
            }`}
          >
            <span className="save-badge-dot" />
            {saveStatus === 'saving' ? 'Guardando…' : 'Guardado'}
          </span>
        </div>
        <div className="detail-header-actions">
          <button
            type="button"
            onClick={() => onConvertToActivity(f)}
            title="Convertir en actividad operativa"
            className="btn-convert-note"
          >
            <ArrowUpRight size={14} strokeWidth={2.2} />
            <span>Convertir en actividad</span>
          </button>
          <button
            onClick={() => {
              const dup: Note = {
                ...f,
                id: crypto.randomUUID(),
                text: f.text + ' (copia)',
                createdAt: new Date().toISOString(),
                completedAt: undefined,
                pinned: false
              }
              setNotes(x => [...x, dup])
              enqueue('createNote', undefined, toSheet(dup))
              close()
            }}
            title="Duplicar nota"
            className="panel-icon-btn"
          >
            <Copy size={16} strokeWidth={2.2} />
          </button>
          <button
            className={`panel-icon-btn ${f.pinned ? 'is-active-pin' : ''}`}
            onClick={() => save({ pinned: !f.pinned })}
            title={f.pinned ? 'Desfijar de la pizarra' : 'Fijar en la pizarra'}
          >
            <Pin size={16} strokeWidth={2.2} />
          </button>
          <button className="panel-close-btn" onClick={close} title="Cerrar panel">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="detail-content">
        <textarea
          className="detail-title-input"
          value={f.text}
          onChange={e => save({ text: e.target.value })}
          placeholder="Título de la nota..."
        />
        <textarea
          className="desc-input"
          placeholder="Agregá notas adicionales o descripción…"
          value={f.description || ''}
          onChange={e => save({ description: e.target.value })}
        />

        <div className="detail-fields-card">
          <label className="field-row">
            <span className="field-label">Fecha</span>
            <input
              type="date"
              className="field-input"
              value={f.date || ''}
              onChange={e => save({ date: e.target.value || undefined })}
            />
          </label>
          <label className="field-row">
            <span className="field-label">Hora</span>
            <input
              type="time"
              className="field-input"
              value={f.time || ''}
              onChange={e => save({ time: e.target.value || undefined })}
            />
          </label>
          <label className="field-row">
            <span className="field-label">Categoría</span>
            <select
              className="field-select"
              value={f.category}
              onChange={e => save({ category: e.target.value })}
            >
              {['General', 'Calidad', 'Ventas', 'Postventa', 'Personal', 'Ideas'].map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span className="field-label">Prioridad</span>
            <select
              className="field-select"
              value={f.priority}
              onChange={e => save({ priority: e.target.value })}
            >
              {['BAJA', 'NORMAL', 'ALTA', 'URGENTE'].map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span className="field-label">Responsable</span>
            <select
              className="field-select"
              value={f.assignee || ''}
              onChange={e => {
                if (e.target.value === '__add__') {
                  const name = window.prompt('Nombre de la persona:')
                  if (name && name.trim()) {
                    addPerson(name.trim())
                    save({ assignee: name.trim() })
                  }
                } else {
                  save({ assignee: e.target.value || undefined })
                }
              }}
            >
              <option value="">Sin asignar</option>
              {people.map((p: string) => (
                <option value={p} key={p}>
                  {p}
                </option>
              ))}
              <option value="__add__">+ Agregar persona...</option>
            </select>
          </label>
        </div>

        <div className="checklist-section">
          <span className="detail-section-title">Checklist</span>
          {items.map(item => (
            <div className="checklist-item" key={item.id}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => {
                  setItems(x => x.map(i => (i.id === item.id ? { ...i, done: !i.done } : i)))
                  enqueue('updateChecklistItem', item.id, { COMPLETADO: !item.done })
                }}
              />
              <span style={{ textDecoration: item.done ? 'line-through' : 'none', flex: 1 }}>
                {item.text}
              </span>
              <button
                className="btn-detail-action btn-detail-danger"
                onClick={() => {
                  setItems(x => x.filter(i => i.id !== item.id))
                  enqueue('deleteChecklistItem', item.id)
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="checklist-add-row">
            <input
              value={newChecklist}
              onChange={e => setNewChecklist(e.target.value)}
              placeholder="Nuevo ítem..."
              onKeyDown={e => {
                if (e.key === 'Enter' && newChecklist.trim()) {
                  const item: ChecklistItem = {
                    id: crypto.randomUUID(),
                    noteId: note.id,
                    text: newChecklist.trim(),
                    done: false,
                    order: items.length
                  }
                  setItems(x => [...x, item])
                  setNewChecklist('')
                  enqueue('createChecklistItem', item.id, {
                    ID: item.id,
                    NOTA_ID: note.id,
                    TEXTO: item.text,
                    COMPLETADO: false,
                    ORDEN: item.order
                  })
                }
              }}
            />
          </div>
        </div>

        <div className="activity-section">
          <span className="detail-section-title">Actividad reciente</span>
          <div className="activity-timeline">
            {activity.map(a => (
              <div className="activity-item" key={a.id}>
                <span className="activity-dot" />
                <div className="activity-text">
                  <b>{a.actor || 'Sistema'}</b> {a.action} {a.detail}
                  <div className="activity-date">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <span style={{ fontSize: 12, color: '#666' }}>No hay actividad reciente.</span>
            )}
          </div>
        </div>

        <div className="color-section">
          <span className="field-label">Color de tarjeta</span>
          <div className="colors-palette">
            {colors.map(c => (
              <button
                className={`color-picker-btn ${c} ${f.color === c ? 'color-active' : ''}`}
                onClick={() => save({ color: c })}
                key={c}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="detail-footer-actions">
          <button
            className={`btn-complete ${f.status === 'HECHO' ? 'complete-reopen' : ''}`}
            onClick={() =>
              save({
                status: f.status === 'HECHO' ? 'PENDIENTE' : 'HECHO',
                completedAt: f.status === 'HECHO' ? undefined : new Date().toISOString()
              })
            }
          >
            {f.status === 'HECHO' ? (
              <>
                <RotateCcw size={16} strokeWidth={2} />
                <span>Reabrir nota</span>
              </>
            ) : (
              <>
                <Check size={16} strokeWidth={2.4} />
                <span>Marcar como hecha</span>
              </>
            )}
          </button>

          <div className="detail-secondary-actions">
            <button
              className="btn-detail-action"
              onClick={() => {
                if (window.confirm('¿Archivar esta nota? Podrás consultarla en el filtro Archivados.')) {
                  archiveNote(f.id)
                }
              }}
              title="Archivar nota"
            >
              <Archive size={15} strokeWidth={2} />
              <span>Archivar</span>
            </button>
            <button
              className="btn-detail-action btn-detail-danger"
              onClick={() => {
                if (
                  window.confirm(
                    '¿Eliminar definitivamente esta nota? Esta acción no se puede deshacer.'
                  )
                ) {
                  removeNote(f.id)
                }
              }}
              title="Eliminar definitivamente"
            >
              <Trash2 size={15} strokeWidth={2} />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

