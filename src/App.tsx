import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutGrid,
  SunMedium,
  ListTodo,
  CalendarDays,
  CircleCheckBig,
  Search,
  Plus,
  Pin,
  Clock,
  RotateCcw,
  Check,
  Settings,
  X,
  AlertCircle,
  Trash2,
  Edit3,
  Archive
} from 'lucide-react'
import './App.css'

type Status = 'PENDIENTE' | 'HECHO' | 'ARCHIVADO'
type View = 'board' | 'today' | 'reminders' | 'calendar' | 'done'
type Note = {
  id: string
  text: string
  description?: string
  status: Status
  date?: string
  time?: string
  category: string
  priority: string
  color: string
  pinned: boolean
  x: number
  y: number
  width: number
  height: number
  createdAt: string
  completedAt?: string
}

const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)

const seed: Note[] = [
  { id: '1', text: 'Revisar resultados SSI', status: 'PENDIENTE', date: today, time: '15:00', category: 'Ventas', priority: 'ALTA', color: 'yellow', pinned: true, x: 90, y: 80, width: 264, height: 160, createdAt: today },
  { id: '2', text: 'Validar tiempos de gestoría', status: 'PENDIENTE', date: today, category: 'Calidad', priority: 'NORMAL', color: 'blue', pinned: false, x: 420, y: 190, width: 264, height: 155, createdAt: today },
  { id: '3', text: 'Hablar con Marcelo por reclamo', status: 'PENDIENTE', date: yesterday, category: 'Postventa', priority: 'URGENTE', color: 'rose', pinned: false, x: 740, y: 90, width: 270, height: 165, createdAt: yesterday },
  { id: '4', text: 'IDEA: mejorar mapa de procesos', status: 'PENDIENTE', category: 'Ideas', priority: 'BAJA', color: 'violet', pinned: false, x: 200, y: 440, width: 264, height: 155, createdAt: today },
  { id: '5', text: 'Actualizar procedimiento de entrega', status: 'HECHO', date: today, category: 'Calidad', priority: 'NORMAL', color: 'green', pinned: false, x: 590, y: 410, width: 264, height: 155, createdAt: today, completedAt: today }
]

const overdue = (n: Note) => n.status === 'PENDIENTE' && !!n.date && n.date < today
const label = (d?: string) => !d ? 'Sin fecha' : d === today ? 'Hoy' : d === tomorrow ? 'Mañana' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00'))
const formatCalendarMonth = (date: Date) => {
  const raw = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/ De /g, ' de ')
}

const apiUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL as string | undefined

const remote = (action: string, id?: string, data?: unknown) =>
  !apiUrl
    ? Promise.resolve()
    : fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, id, data })
      })
        .then(r => r.json())
        .then(r => {
          if (!r.success) throw Error(r.error || 'Error de sincronización')
        })

const toSheet = (n: Partial<Note>) =>
  Object.fromEntries(
    Object.entries(n).map(([k, v]) => [
      {
        id: 'ID',
        text: 'TEXTO',
        description: 'DESCRIPCION',
        status: 'ESTADO',
        date: 'FECHA',
        time: 'HORA',
        category: 'CATEGORIA',
        priority: 'PRIORIDAD',
        color: 'COLOR',
        pinned: 'FIJADA',
        x: 'X',
        y: 'Y',
        width: 'ANCHO',
        height: 'ALTO',
        createdAt: 'CREADO_EN',
        completedAt: 'COMPLETADO_EN'
      }[k] || k.toUpperCase(),
      v
    ])
  )

const fromSheet = (n: any): Note => ({
  id: n.ID,
  text: n.TEXTO || '',
  description: n.DESCRIPCION || '',
  status: n.ESTADO || 'PENDIENTE',
  date: n.FECHA || undefined,
  time: n.HORA || undefined,
  category: n.CATEGORIA || 'General',
  priority: n.PRIORIDAD || 'NORMAL',
  color: n.COLOR || 'yellow',
  pinned: n.FIJADA === true || n.FIJADA === 'TRUE',
  x: Number(n.X) || 120,
  y: Number(n.Y) || 120,
  width: Number(n.ANCHO) || 264,
  height: Number(n.ALTO) || 155,
  createdAt: n.CREADO_EN || new Date().toISOString(),
  completedAt: n.COMPLETADO_EN || undefined
})

export default function App() {
  const [notes, setNotes] = useState<Note[]>(() => JSON.parse(localStorage.getItem('mi-tablero-notes') || 'null') ?? seed)
  const [view, setView] = useState<View>('board')
  const [filter, setFilter] = useState('Pendientes')
  const [selected, setSelected] = useState<Note | null>(null)
  const [composer, setComposer] = useState(false)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const board = useRef<HTMLDivElement>(null)

  useEffect(() => localStorage.setItem('mi-tablero-notes', JSON.stringify(notes)), [notes])

  useEffect(() => {
    if (apiUrl) {
      fetch(`${apiUrl}?action=getNotes`)
        .then(r => r.json())
        .then(r => {
          if (r.success) {
            if (r.data && r.data.length > 0) {
              setNotes(r.data.map(fromSheet))
            } else {
              // Si la hoja está recién creada y vacía, inicializar con las notas actuales
              notes.forEach(n => void remote('createNote', undefined, toSheet(n)))
            }
          }
        })
        .catch(() => console.warn('No se pudo cargar Google Sheets; se usa el cache local'))
    }
  }, [])

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setComposer(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
      if (e.key === 'Escape') {
        setSelected(null)
        setPalette(false)
        setComposer(false)
      }
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])

  const update = (id: string, data: Partial<Note>) => {
    setNotes(x => x.map(n => (n.id === id ? { ...n, ...data } : n)))
    void remote('updateNote', id, toSheet(data)).catch(() => console.warn('Error de sincronización'))
  }

  const removeNote = (id: string) => {
    setNotes(x => x.filter(n => n.id !== id))
    if (selected?.id === id) setSelected(null)
    void remote('deleteNote', id).catch(() => console.warn('Error al eliminar en Google Sheets'))
  }

  const archiveNote = (id: string) => {
    update(id, { status: 'ARCHIVADO' })
    if (selected?.id === id) setSelected(null)
  }

  const create = (text: string, date?: string) => {
    if (!text.trim()) return
    const r = board.current?.getBoundingClientRect()
    const n: Note = {
      id: crypto.randomUUID(),
      text: text.trim(),
      status: 'PENDIENTE',
      date,
      category: 'General',
      priority: 'NORMAL',
      color: 'yellow',
      pinned: false,
      x: Math.max(70, (r?.width || 800) / 2 - 132),
      y: Math.max(70, (r?.height || 600) / 2 - 78),
      width: 264,
      height: 155,
      createdAt: new Date().toISOString()
    }
    setNotes(x => [...x, n])
    void remote('createNote', undefined, toSheet(n)).catch(() => console.warn('Error de sincronización'))
    setComposer(false)
    setSelected(n)
  }

  const pending = notes.filter(n => n.status === 'PENDIENTE')
  const shown = useMemo(
    () =>
      notes
        .filter(n =>
          filter === 'Pendientes'
            ? n.status === 'PENDIENTE'
            : filter === 'Hoy'
            ? n.status === 'PENDIENTE' && n.date === today
            : filter === 'Vencidos'
            ? overdue(n)
            : filter === 'Fijadas'
            ? n.pinned && n.status === 'PENDIENTE'
            : filter === 'Hechos'
            ? n.status === 'HECHO'
            : filter === 'Todos'
            ? n.status !== 'ARCHIVADO'
            : n.status === 'PENDIENTE'
        )
        .filter(n => !query || `${n.text} ${n.category}`.toLowerCase().includes(query.toLowerCase())),
    [notes, filter, query]
  )

  const nav: [View, React.ReactNode, string][] = [
    ['board', <LayoutGrid size={18} strokeWidth={1.9} />, 'Pizarrón'],
    ['today', <SunMedium size={18} strokeWidth={1.9} />, 'Mi día'],
    ['reminders', <ListTodo size={18} strokeWidth={1.9} />, 'Recordatorios'],
    ['calendar', <CalendarDays size={18} strokeWidth={1.9} />, 'Calendario'],
    ['done', <CircleCheckBig size={18} strokeWidth={1.9} />, 'Hechos']
  ]

  const categories = ['General', 'Calidad', 'Ventas', 'Postventa', 'Personal', 'Ideas']

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">M</div>
          <div className="brand-info">
            <span className="brand-title">Mi Tablero</span>
            <span className="brand-sub">Workspace</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(([v, icon, t]) => (
            <button className={`nav-item ${view === v ? 'active' : ''}`} onClick={() => setView(v)} key={v}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{t}</span>
              {v === 'reminders' && pending.length > 0 && <em className="badge-count">{pending.length}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <span className="sidebar-section-title">CATEGORÍAS</span>
          <div className="cat-list">
            {categories.map(c => (
              <button
                className="cat-item"
                onClick={() => {
                  setView('board')
                  setQuery(c)
                }}
                key={c}
              >
                <span className={`cat-dot cat-dot-${c.toLowerCase()}`} />
                <span className="cat-name">{c}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="sidebar-footer">
          <div className="footer-status">
            <span className="status-indicator" />
            <span>Sincronizado</span>
          </div>
          <div className="footer-action">
            <Settings size={15} strokeWidth={1.8} />
            <span>Configuración</span>
          </div>
        </footer>
      </aside>

      <main className="main-content">
        <header className="app-header">
          <button className="search-box" onClick={() => setPalette(true)}>
            <Search size={17} strokeWidth={1.9} className="search-icon" />
            <span className="search-placeholder">Buscar notas, categorías…</span>
            <kbd className="search-keycap">Ctrl K</kbd>
          </button>
          <button className="btn-new-note" onClick={() => setComposer(true)}>
            <Plus size={16} strokeWidth={2.4} />
            <span>Nueva nota</span>
          </button>
        </header>

        <div className="view-container">
          {view === 'board' && (
            <Board
              notes={shown}
              filter={filter}
              setFilter={setFilter}
              counts={[
                notes.filter(n => n.status !== 'ARCHIVADO').length,
                pending.length,
                pending.filter(n => n.date === today).length,
                pending.filter(overdue).length,
                notes.filter(n => n.pinned && n.status !== 'ARCHIVADO').length,
                notes.filter(n => n.status === 'HECHO').length
              ]}
              update={update}
              removeNote={removeNote}
              select={setSelected}
              boardRef={board}
            />
          )}
          {view === 'today' && (
            <List
              title="Mi día"
              subtitle="Lo que merece tu atención hoy."
              notes={pending.filter(n => overdue(n) || n.date === today)}
              update={update}
              removeNote={removeNote}
              select={setSelected}
              grouped
            />
          )}
          {view === 'reminders' && (
            <Reminders
              notes={pending}
              update={update}
              removeNote={removeNote}
              select={setSelected}
            />
          )}
          {view === 'done' && (
            <List
              title="Hechos"
              subtitle="Todo lo que ya resolviste y completaste."
              notes={notes.filter(n => n.status === 'HECHO')}
              update={update}
              removeNote={removeNote}
              select={setSelected}
            />
          )}
          {view === 'calendar' && <Calendar notes={notes} select={setSelected} />}
        </div>
      </main>

      {composer && <Composer close={() => setComposer(false)} create={create} />}
      {palette && (
        <Palette
          notes={notes}
          close={() => setPalette(false)}
          select={setSelected}
          go={(v: View) => {
            setView(v)
            setPalette(false)
          }}
        />
      )}
      {selected && (
        <Detail
          note={notes.find(n => n.id === selected.id) || selected}
          update={update}
          removeNote={removeNote}
          archiveNote={archiveNote}
          close={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function Board({ notes, filter, setFilter, counts, update, removeNote, select, boardRef }: any) {
  const filterList = [
    { key: 'Pendientes', count: counts[1] },
    { key: 'Hoy', count: counts[2] },
    { key: 'Vencidos', count: counts[3] },
    { key: 'Fijadas', count: counts[4] },
    { key: 'Todos', count: counts[0] },
    { key: 'Hechos', count: counts[5] }
  ]

  return (
    <section className="board-page">
      <div className="toolbar">
        <div className="filter-chips">
          {filterList.map(item => (
            <button
              className={`filter-chip ${filter === item.key ? 'chosen' : ''}`}
              onClick={() => setFilter(item.key)}
              key={item.key}
            >
              <span>{item.key}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className={`chip-badge ${item.key === 'Vencidos' && item.count > 0 ? 'badge-danger' : ''}`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="canvas-zoom-control">
          <button className="zoom-btn" title="Alejar">−</button>
          <span className="zoom-value">100%</span>
          <button className="zoom-btn" title="Acercar">+</button>
        </div>
      </div>
      <div className="board" ref={boardRef}>
        {notes.length ? (
          notes.map((n: Note) => (
            <Card
              note={n}
              update={update}
              removeNote={removeNote}
              select={select}
              key={n.id}
            />
          ))
        ) : (
          <div className="empty">
            <div className="empty-icon-wrap">
              <LayoutGrid size={32} strokeWidth={1.6} />
            </div>
            <h2>Tu pizarrón está vacío</h2>
            <p>Escribí algo que quieras recordar o creá una nueva nota.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function Card({ note, update, removeNote, select }: any) {
  const start = useRef<any>(null)
  const [isDragging, setIsDragging] = useState(false)

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    start.current = { x: e.clientX, y: e.clientY, l: note.x, t: note.y }
    setIsDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent) => {
    if (!start.current) return
    update(note.id, {
      x: Math.max(0, start.current.l + e.clientX - start.current.x),
      y: Math.max(0, start.current.t + e.clientY - start.current.y)
    })
  }

  const up = () => {
    start.current = null
    setIsDragging(false)
  }

  const isOverdue = overdue(note)

  return (
    <article
      className={`card ${note.color} ${note.status === 'HECHO' ? 'done' : ''} ${note.pinned ? 'is-pinned' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ left: note.x, top: note.y, width: note.width, minHeight: note.height }}
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
            <span>{isOverdue ? 'Vencida' : label(note.date)}</span>
            {note.time && <span className="meta-time">· {note.time}</span>}
          </span>
        )}
      </div>

      <div className="actions">
        <button
          className="btn-action-status"
          onClick={() =>
            update(note.id, {
              status: note.status === 'HECHO' ? 'PENDIENTE' : 'HECHO',
              completedAt: new Date().toISOString()
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

function List({ title, subtitle, notes, update, removeNote, select, grouped }: any) {
  const late = notes.filter(overdue)
  const rest = notes.filter((n: Note) => !overdue(n))

  return (
    <section className="list-view">
      <div className="heading">
        <p className="subtitle">{subtitle}</p>
        <div className="title-row">
          <h1>{title}</h1>
          <div className="stats-pills">
            <span className="stat-pill">{notes.length} total</span>
            {late.length > 0 && <span className="stat-pill stat-pill-danger">{late.length} vencidas</span>}
          </div>
        </div>
      </div>
      {grouped && late.length > 0 && (
        <NoteList title="Vencidos" notes={late} update={update} removeNote={removeNote} select={select} isOverdueSection />
      )}
      <NoteList title={grouped ? 'Para hoy' : ''} notes={rest} update={update} removeNote={removeNote} select={select} />
    </section>
  )
}

function NoteList({ title, notes, update, removeNote, select, isOverdueSection }: any) {
  return (
    <div className="note-list">
      {title && (
        <div className="note-list-header">
          <h2>{title}</h2>
          <small className={isOverdueSection ? 'badge-danger' : ''}>{notes.length}</small>
        </div>
      )}
      {notes.length ? (
        notes.map((n: Note) => (
          <div className={`rem ${n.status === 'HECHO' ? 'rem-done' : ''}`} key={n.id}>
            <button
              className={`check ${n.status === 'HECHO' ? 'checked' : ''}`}
              onClick={() =>
                update(n.id, {
                  status: n.status === 'HECHO' ? 'PENDIENTE' : 'HECHO',
                  completedAt: new Date().toISOString()
                })
              }
              title={n.status === 'HECHO' ? 'Marcar como pendiente' : 'Marcar como resuelta'}
            >
              <Check size={13} strokeWidth={2.8} />
            </button>
            <button className="remtext" onClick={() => select(n)}>
              <b>{n.text}</b>
              <div className="rem-subinfo">
                {overdue(n) ? (
                  <span className="overdue-tag">Vencida · {label(n.date)}</span>
                ) : (
                  <span>{label(n.date)}</span>
                )}
                {n.time && <span>· {n.time}</span>}
                <span className="rem-cat-badge">{n.category}</span>
                <span className={`rem-prio prio-${n.priority.toLowerCase()}`}>{n.priority}</span>
              </div>
            </button>
            <div className="rem-actions">
              <button className="postpone" onClick={() => update(n.id, { date: tomorrow })} title="Posponer a mañana">
                <Clock size={13} strokeWidth={2} />
                <span>Mañana</span>
              </button>
              <button className="rem-icon-btn" onClick={() => select(n)} title="Editar">
                <Edit3 size={14} strokeWidth={1.9} />
              </button>
              <button
                className="rem-icon-btn rem-icon-delete"
                onClick={() => {
                  if (window.confirm('¿Eliminar esta nota?')) {
                    removeNote(n.id)
                  }
                }}
                title="Eliminar"
              >
                <Trash2 size={14} strokeWidth={1.9} />
              </button>
            </div>
          </div>
        ))
      ) : (
        <p className="nothing">No hay notas en esta sección.</p>
      )}
    </div>
  )
}

function Reminders({ notes, update, removeNote, select }: any) {
  const late = notes.filter(overdue)
  const todayNotes = notes.filter((n: Note) => n.date === today)
  const tomorrowNotes = notes.filter((n: Note) => n.date === tomorrow)
  const noDateNotes = notes.filter((n: Note) => !n.date)

  return (
    <section className="list-view">
      <div className="heading">
        <p className="subtitle">Tus compromisos y pendientes ordenados</p>
        <div className="title-row">
          <h1>Mis recordatorios</h1>
          <div className="stats-pills">
            <span className="stat-pill">{notes.length} pendientes</span>
            {late.length > 0 && <span className="stat-pill stat-pill-danger">{late.length} vencidas</span>}
          </div>
        </div>
      </div>
      {[
        ['Vencidos', late, true],
        ['Hoy', todayNotes, false],
        ['Mañana', tomorrowNotes, false],
        ['Sin fecha', noDateNotes, false]
      ].map(([t, ns, isLate]: any) => (
        <NoteList
          title={t}
          notes={ns}
          update={update}
          removeNote={removeNote}
          select={select}
          isOverdueSection={isLate}
          key={t}
        />
      ))}
    </section>
  )
}

function Calendar({ notes, select }: any) {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

  return (
    <section className="calendar-view">
      <div className="heading">
        <p className="subtitle">Planificación y vista mensual</p>
        <div className="title-row">
          <h1>{formatCalendarMonth(d)}</h1>
          <span className="stat-pill">{notes.filter((n: Note) => !!n.date).length} notas programadas</span>
        </div>
      </div>
      <div className="calendar-container">
        <div className="calhead">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(x => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <div className="grid">
          {Array.from({ length: start }, (_, i) => (
            <div className="empty-day" key={'b' + i} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const a = notes.filter((n: Note) => n.date === ds)
            return (
              <div className={`cal-cell ${ds === today ? 'now' : ''}`} key={day}>
                <div className="cell-header">
                  <span className="cell-num">{day}</span>
                  {a.length > 0 && <span className="cell-count-tag">{a.length}</span>}
                </div>
                <div className="cell-notes">
                  {a.slice(0, 4).map((n: Note) => (
                    <button
                      className={`cal-note-pill ${n.color}`}
                      onClick={() => select(n)}
                      key={n.id}
                      title={n.text}
                    >
                      <span className="cal-note-dot" />
                      <span className="cal-note-text">{n.text}</span>
                    </button>
                  ))}
                  {a.length > 4 && <small className="cal-more">+{a.length - 4} más</small>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Composer({ close, create }: any) {
  const [text, setText] = useState('')
  const [date, setDate] = useState<string | undefined>()

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && close()}>
      <form
        className="composer-modal"
        onSubmit={e => {
          e.preventDefault()
          create(text, date)
        }}
      >
        <button type="button" className="modal-close-btn" onClick={close} title="Cerrar">
          <X size={18} strokeWidth={2} />
        </button>
        <small className="modal-tag">NUEVA NOTA</small>
        <input
          autoFocus
          className="composer-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="¿Qué querés recordar?"
        />
        <div className="composer-bottom">
          <div className="quick-dates">
            <button
              type="button"
              className={date === today ? 'btn-date-selected' : ''}
              onClick={() => setDate(today)}
            >
              Hoy
            </button>
            <button
              type="button"
              className={date === tomorrow ? 'btn-date-selected' : ''}
              onClick={() => setDate(tomorrow)}
            >
              Mañana
            </button>
          </div>
          <button className="btn-modal-submit" type="submit">
            <Plus size={16} strokeWidth={2.4} />
            <span>Crear nota</span>
          </button>
        </div>
      </form>
    </div>
  )
}

function Palette({ notes, close, select, go }: any) {
  const [q, setQ] = useState('')
  const hits = notes
    .filter((n: Note) => `${n.text} ${n.category} ${n.description || ''}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 5)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="palette-modal">
        <div className="palette-input-wrap">
          <Search size={18} strokeWidth={2} className="palette-search-icon" />
          <input
            autoFocus
            className="palette-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar nota, categoría o comando…"
          />
        </div>
        <small className="modal-tag">NAVEGAR A</small>
        <div className="palette-nav-list">
          {[
            ['board', 'Pizarrón'],
            ['today', 'Mi día'],
            ['reminders', 'Recordatorios'],
            ['calendar', 'Calendario'],
            ['done', 'Hechos']
          ].map(([v, l]) => (
            <button className="palette-cmd-btn" onClick={() => go(v)} key={v}>
              <span>{l}</span>
              <kbd className="cmd-kbd">Ir</kbd>
            </button>
          ))}
        </div>
        {hits.length > 0 && (
          <>
            <small className="modal-tag">NOTAS ENCONTRADAS</small>
            <div className="palette-hits-list">
              {hits.map((n: Note) => (
                <button
                  className="palette-hit-item"
                  onClick={() => {
                    select(n)
                    close()
                  }}
                  key={n.id}
                >
                  <span className="hit-text">{n.text}</span>
                  <i className="hit-cat">{n.category}</i>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="palette-footer">
          <button className="closepal" onClick={close}>
            Cerrar Esc
          </button>
        </div>
      </div>
    </div>
  )
}

function Detail({ note, update, removeNote, archiveNote, close }: any) {
  const [f, setF] = useState(note)
  useEffect(() => setF(note), [note])

  const save = (x: any) => {
    setF((old: any) => ({ ...old, ...x }))
    update(note.id, x)
  }

  const colors = ['yellow', 'blue', 'green', 'rose', 'violet']

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <small className="modal-tag">DETALLE DE NOTA</small>
        <div className="detail-header-actions">
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
            <select className="field-select" value={f.category} onChange={e => save({ category: e.target.value })}>
              {['General', 'Calidad', 'Ventas', 'Postventa', 'Personal', 'Ideas'].map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span className="field-label">Prioridad</span>
            <select className="field-select" value={f.priority} onChange={e => save({ priority: e.target.value })}>
              {['BAJA', 'NORMAL', 'ALTA', 'URGENTE'].map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
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
                completedAt: new Date().toISOString()
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
                if (window.confirm('¿Archivar esta nota? Podrás consultarla en Google Sheets.')) {
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
                if (window.confirm('¿Eliminar definitivamente esta nota? Esta acción no se puede deshacer.')) {
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
