import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutGrid, SunMedium, ListTodo, CalendarDays, CircleCheckBig, Search, Plus,
  Pin, Clock, RotateCcw, Check, Settings, X, AlertCircle, Trash2, Edit3, Archive,
  User, Users, Copy, Activity
} from 'lucide-react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import './App.css'

import type { Note, View, ChecklistItem, ActivityEntry } from './types'
import {
  fetchNotes, fetchPeople, fetchActivity, fetchChecklist,
  enqueue, retryNow, hasPending, toSheet, syncListeners, syncStatus
} from './services/sheetsApi'

const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10)

const overdue = (n: Note) => n.status === 'PENDIENTE' && !!n.date && n.date < today

const label = (d?: string) => {
  if (!d) return 'Sin fecha'
  const clean = d.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : d
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

const formatCalendarMonth = (date: Date) => {
  const raw = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/ De /g, ' de ')
}

function useSyncStatus() {
  const [status, setStatus] = useState(syncStatus)
  useEffect(() => {
    syncListeners.add(setStatus)
    return () => { syncListeners.delete(setStatus) }
  }, [])
  return status
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem('mi-tablero-notes')
      if (!saved) return []
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed.map((n: Note) => ({
          ...n,
          date: n.date
        }))
      }
      return []
    } catch {
      return []
    }
  })
  const [view, setView] = useState<View>('board')
  const [filter, setFilter] = useState('Pendientes')
  const [activeMember, setActiveMember] = useState<string>('Todos')
  // Miembros fijos del equipo — hardcodeados para que aparezcan en cualquier dispositivo.
  // Si se agrega alguien nuevo con "+", se une a esta lista base.
  const BASE_PEOPLE = ['Nelson', 'Melisa Condori', 'Equipo']
  const [people, setPeople] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mi-tablero-people-extra')
      const extra: string[] = saved ? JSON.parse(saved) : []
      // Unimos los base con los extras guardados, sin duplicados
      const set = new Set([...BASE_PEOPLE, ...(Array.isArray(extra) ? extra : [])])
      return Array.from(set)
    } catch {
      return BASE_PEOPLE
    }
  })
  const [selected, setSelected] = useState<Note | null>(null)
  const [composer, setComposer] = useState(false)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState('')
  const board = useRef<HTMLDivElement>(null)

  useEffect(() => localStorage.setItem('mi-tablero-notes', JSON.stringify(notes)), [notes])
  // Guardamos solo los miembros extras (los que NO son de la lista base) en localStorage
  useEffect(() => {
    const extras = people.filter(p => !BASE_PEOPLE.includes(p))
    localStorage.setItem('mi-tablero-people-extra', JSON.stringify(extras))
  }, [people])

  useEffect(() => {
    const reload = async () => {
      if (hasPending()) return
      try {
        const fresh = await fetchNotes()
        if (fresh.length > 0) setNotes(fresh)
        const p = await fetchPeople()
        if (p.length > 0) setPeople(p.map(x => x.name))
      } catch {}
    }
    reload()
    const onFocus = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onFocus)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 30000)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      clearInterval(timer)
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
    enqueue('updateNote', id, toSheet(data))
  }

  const removeNote = (id: string) => {
    setNotes(x => x.filter(n => n.id !== id))
    if (selected?.id === id) setSelected(null)
    enqueue('deleteNote', id)
  }

  const archiveNote = (id: string) => {
    update(id, { status: 'ARCHIVADO' })
    if (selected?.id === id) setSelected(null)
  }

  const addPerson = (name: string) => {
    const trimmed = name.trim()
    if (trimmed && !people.includes(trimmed)) {
      setPeople(prev => [...prev, trimmed])
      enqueue('createPerson', undefined, { NOMBRE: trimmed })
    }
  }

  const create = (text: string, date?: string, assignee?: string) => {
    if (!text.trim()) return
    const r = board.current?.getBoundingClientRect()
    const n: Note = {
      id: crypto.randomUUID(),
      text: text.trim(),
      status: 'PENDIENTE',
      date: date,
      category: 'General',
      priority: 'NORMAL',
      assignee: assignee || (activeMember !== 'Todos' ? activeMember : undefined),
      color: 'yellow',
      pinned: false,
      x: Math.max(70, (r?.width || 800) / 2 - 132),
      y: Math.max(70, (r?.height || 600) / 2 - 78),
      width: 264,
      height: 155,
      createdAt: new Date().toISOString()
    }
    setNotes(x => [...x, n])
    enqueue('createNote', undefined, toSheet(n))
    setComposer(false)
    setSelected(n)
  }

  // Notas filtradas por el miembro activo (Pestaña actual: Todos, Nelson, Melisa Condori, etc.)
  const memberNotes = useMemo(() => {
    if (activeMember === 'Todos') return notes
    return notes.filter(n => n.assignee === activeMember)
  }, [notes, activeMember])

  const pending = memberNotes.filter(n => n.status === 'PENDIENTE')
  const shown = useMemo(
    () =>
      memberNotes
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
        .filter(n => !query || `${n.text} ${n.category} ${n.assignee || ''}`.toLowerCase().includes(query.toLowerCase())),
    [memberNotes, filter, query]
  )

  const syncSt = useSyncStatus()

  const nav: [View, React.ReactNode, string][] = [
    ['board', <LayoutGrid size={18} strokeWidth={1.9} />, 'Pizarrón'],
    ['today', <SunMedium size={18} strokeWidth={1.9} />, 'Mi día'],
    ['reminders', <ListTodo size={18} strokeWidth={1.9} />, 'Recordatorios'],
    ['calendar', <CalendarDays size={18} strokeWidth={1.9} />, 'Calendario'],
    ['done', <CircleCheckBig size={18} strokeWidth={1.9} />, 'Hechos'],
    ['archived', <Archive size={18} strokeWidth={1.9} />, 'Archivados'],
    ['activity', <Activity size={18} strokeWidth={1.9} />, 'Actividad']
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

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">ESPACIO / PERSONA</span>
            <button
              className="btn-add-member-small"
              onClick={() => {
                const name = window.prompt('Nombre del nuevo miembro del equipo:')
                if (name && name.trim()) {
                  addPerson(name.trim())
                  setActiveMember(name.trim())
                }
              }}
              title="Agregar persona"
            >
              <Plus size={13} strokeWidth={2.4} />
            </button>
          </div>
          <div className="workspace-tabs-list">
            <button
              className={`workspace-tab-item ${activeMember === 'Todos' ? 'active' : ''}`}
              onClick={() => setActiveMember('Todos')}
            >
              <Users size={15} strokeWidth={1.9} />
              <span className="workspace-tab-name">General (Todos)</span>
              <span className="workspace-tab-count">
                {notes.filter(n => n.status === 'PENDIENTE').length}
              </span>
            </button>
            {people.map(p => {
              const count = notes.filter(n => n.status === 'PENDIENTE' && n.assignee === p).length
              return (
                <button
                  className={`workspace-tab-item ${activeMember === p ? 'active' : ''}`}
                  onClick={() => setActiveMember(p)}
                  key={p}
                >
                  <User size={15} strokeWidth={1.9} />
                  <span className="workspace-tab-name">{p}</span>
                  {count > 0 && <span className="workspace-tab-count">{count}</span>}
                </button>
              )
            })}
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
            {syncSt === 'saving' && <><span className="status-indicator status-saving" />Guardando…</>}
            {syncSt === 'idle' && <><span className="status-indicator" />Sincronizado</>}
            {syncSt === 'error' && <><span className="status-indicator status-error" />Error — <button onClick={retryNow}>Reintentar</button></>}
            {syncSt === 'offline' && <><span className="status-indicator status-error" />Sin conexión</>}
          </div>
          <div className="footer-action">
            <Settings size={15} strokeWidth={1.8} />
            <span>Configuración</span>
          </div>
        </footer>
      </aside>

      <main className="main-content">
        <header className="app-header">
          <div className="current-workspace-indicator">
            <span className="current-workspace-label">Pestaña:</span>
            <span className="current-workspace-badge">
              {activeMember === 'Todos' ? (
                <>
                  <Users size={14} strokeWidth={2} /> Todos los miembros
                </>
              ) : (
                <>
                  <User size={14} strokeWidth={2} /> {activeMember}
                </>
              )}
            </span>
          </div>
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
                memberNotes.filter(n => n.status !== 'ARCHIVADO').length,
                pending.length,
                pending.filter(n => n.date === today).length,
                pending.filter(overdue).length,
                memberNotes.filter(n => n.pinned && n.status !== 'ARCHIVADO').length,
                memberNotes.filter(n => n.status === 'HECHO').length
              ]}
              query={query}
              setQuery={setQuery}
              update={update}
              removeNote={removeNote}
              select={setSelected}
              people={people}
              boardRef={board}
            />
          )}
          {view === 'today' && (
            <List
              title={activeMember === 'Todos' ? 'Mi día' : `Mi día · ${activeMember}`}
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
              title={activeMember === 'Todos' ? 'Mis recordatorios' : `Recordatorios · ${activeMember}`}
              update={update}
              removeNote={removeNote}
              select={setSelected}
            />
          )}
          {view === 'done' && (
            <List
              title={activeMember === 'Todos' ? 'Hechos' : `Hechos · ${activeMember}`}
              subtitle="Todo lo que ya resolviste y completaste."
              notes={memberNotes.filter(n => n.status === 'HECHO')}
              update={update}
              removeNote={removeNote}
              select={setSelected}
            />
          )}
          {view === 'archived' && (
            <List
              title="Archivados"
              subtitle="Notas que ya no están activas."
              notes={notes.filter(n => n.status === 'ARCHIVADO')}
              update={update}
              removeNote={removeNote}
              select={setSelected}
              showRestore
            />
          )}
          {view === 'calendar' && <Calendar notes={memberNotes} select={setSelected} />}
        </div>
      </main>

      {composer && <Composer close={() => setComposer(false)} create={create} people={people} addPerson={addPerson} />}
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
          people={people}
          addPerson={addPerson}
          close={() => setSelected(null)}
          setNotes={setNotes}
        />
      )}
    </div>
  )
}

function Board({ notes, filter, setFilter, counts, query, setQuery, update, removeNote, select, people, boardRef }: any) {
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
        <div className="toolbar-left">
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

          {query && (
            <div className="active-filter-badge" title="Filtro activo">
              <span>Filtro: <b>{query}</b></span>
              <button onClick={() => setQuery('')} title="Quitar filtro">
                <X size={12} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>

      </div>
      <TransformWrapper
        initialScale={1}
        minScale={0.3}
        maxScale={2}
        wheel={{ step: 0.1 }}
        panning={{ disabled: false }}
        doubleClick={{ disabled: true }}
      >
        {({ zoomIn, zoomOut, resetTransform, state }) => (
          <>
            <div className="canvas-zoom-control" style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 100 }}>
              <button className="zoom-btn" onClick={() => zoomOut()} title="Alejar">−</button>
              <button className="zoom-value" onClick={() => resetTransform()}>{Math.round(state.scale * 100)}%</button>
              <button className="zoom-btn" onClick={() => zoomIn()} title="Acercar">+</button>
            </div>
            <TransformComponent wrapperClass="board" contentClass="board-canvas">
              <div ref={boardRef} style={{ width: '100%', height: '100%' }}>
                {notes.length ? (
                  notes.map((n: Note) => (
                    <Card
                      note={n}
                      update={update}
                      removeNote={removeNote}
                      select={select}
                      people={people}
                      key={n.id}
                    />
                  ))
                ) : (
                  <div className="empty">
                    <div className="empty-icon-wrap">
                      <LayoutGrid size={32} strokeWidth={1.6} />
                    </div>
                    <h2>{query || filter !== 'Todos' ? 'No hay notas con este filtro' : 'Tu pizarrón está vacío'}</h2>
                    <p>
                      {query || filter !== 'Todos'
                        ? 'Probá cambiando la categoría o el filtro seleccionado.'
                        : 'Escribí algo que quieras recordar o creá una nueva nota.'}
                    </p>
                  </div>
                )}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </section>
  )
}

function Card({ note, update, removeNote, select, people }: any) {
  const start = useRef<any>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [localPos, setLocalPos] = useState({ x: note.x, y: note.y })
  const [showAssign, setShowAssign] = useState(false)

  useEffect(() => { setLocalPos({ x: note.x, y: note.y }) }, [note.x, note.y])

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select')) return
    start.current = { x: e.clientX, y: e.clientY, l: note.x, t: note.y }
    setIsDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const move = (e: React.PointerEvent) => {
    if (!start.current) return
    setLocalPos({
      x: Math.max(0, start.current.l + e.clientX - start.current.x),
      y: Math.max(0, start.current.t + e.clientY - start.current.y)
    })
  }

  const up = () => {
    if (start.current && isDragging) {
      update(note.id, { x: localPos.x, y: localPos.y })
    }
    start.current = null
    setIsDragging(false)
  }

  const isOverdue = overdue(note)

  return (
    <article
      className={`card ${note.color} ${note.status === 'HECHO' ? 'done' : ''} ${note.pinned ? 'is-pinned' : ''} ${isDragging ? 'dragging' : ''}`}
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
          {/* Pill de responsable — clickeable para reasignar */}
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
                <option value={p} key={p}>{p}</option>
              ))}
            </select>
          ) : (
            <button
              className={`assignee-pill assignee-pill-btn ${note.assignee ? '' : 'assignee-pill-empty'}`}
              title="Clic para asignar responsable"
              onClick={e => { e.stopPropagation(); setShowAssign(true) }}
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
            <span>{isOverdue ? 'Vencida' : label(note.date)}</span>
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
      {notes.length === 0 ? (
        <div className="list-empty-state">
          <p className="nothing">No hay notas en esta sección por el momento.</p>
        </div>
      ) : (
        <>
          {grouped && late.length > 0 && (
            <NoteList title="Vencidos" notes={late} update={update} removeNote={removeNote} select={select} isOverdueSection />
          )}
          <NoteList title={grouped && late.length > 0 ? 'Para hoy' : ''} notes={rest} update={update} removeNote={removeNote} select={select} />
        </>
      )}
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
                {n.assignee && (
                  <span className="rem-assignee-badge">
                    <User size={10} strokeWidth={2} />
                    {n.assignee}
                  </span>
                )}
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

function Reminders({ notes, title, update, removeNote, select }: any) {
  const late = notes.filter(overdue)
  const todayNotes = notes.filter((n: Note) => n.date === today)
  const tomorrowNotes = notes.filter((n: Note) => n.date === tomorrow)
  const noDateNotes = notes.filter((n: Note) => !n.date)

  return (
    <section className="list-view">
      <div className="heading">
        <p className="subtitle">Tus compromisos y pendientes ordenados</p>
        <div className="title-row">
          <h1>{title || 'Mis recordatorios'}</h1>
          <div className="stats-pills">
            <span className="stat-pill">{notes.length} pendientes</span>
            {late.length > 0 && <span className="stat-pill stat-pill-danger">{late.length} vencidas</span>}
          </div>
        </div>
      </div>
      {notes.length === 0 ? (
        <div className="list-empty-state">
          <p className="nothing">No tenés recordatorios pendientes actualmente.</p>
        </div>
      ) : (
        [
          ['Vencidos', late, true],
          ['Hoy', todayNotes, false],
          ['Mañana', tomorrowNotes, false],
          ['Sin fecha', noDateNotes, false]
        ]
          .filter(([, ns]: any) => ns.length > 0)
          .map(([t, ns, isLate]: any) => (
            <NoteList
              title={t}
              notes={ns}
              update={update}
              removeNote={removeNote}
              select={select}
              isOverdueSection={isLate}
              key={t}
            />
          ))
      )}
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

function Composer({ close, create, people, addPerson }: any) {
  const [text, setText] = useState('')
  const [date, setDate] = useState<string | undefined>()
  const [assignee, setAssignee] = useState<string>('')
  const [newPersonInput, setNewPersonInput] = useState('')
  const [showAddPerson, setShowAddPerson] = useState(false)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && close()}>
      <form
        className="composer-modal"
        onSubmit={e => {
          e.preventDefault()
          create(text, date, assignee || undefined)
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

        <div className="composer-assignee-row">
          <span className="composer-label">
            <User size={13} strokeWidth={2} /> Responsable:
          </span>
          <div className="composer-assignee-pills">
            <button
              type="button"
              className={`pill-assignee ${!assignee ? 'pill-assignee-active' : ''}`}
              onClick={() => setAssignee('')}
            >
              Sin asignar
            </button>
            {people.map((p: string) => (
              <button
                type="button"
                className={`pill-assignee ${assignee === p ? 'pill-assignee-active' : ''}`}
                onClick={() => setAssignee(p)}
                key={p}
              >
                {p}
              </button>
            ))}
            {!showAddPerson ? (
              <button
                type="button"
                className="pill-assignee-add"
                onClick={() => setShowAddPerson(true)}
                title="Agregar persona"
              >
                + Persona
              </button>
            ) : (
              <div className="inline-add-person">
                <input
                  type="text"
                  placeholder="Nombre..."
                  value={newPersonInput}
                  onChange={e => setNewPersonInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (newPersonInput.trim()) {
                        addPerson(newPersonInput.trim())
                        setAssignee(newPersonInput.trim())
                        setNewPersonInput('')
                        setShowAddPerson(false)
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newPersonInput.trim()) {
                      addPerson(newPersonInput.trim())
                      setAssignee(newPersonInput.trim())
                      setNewPersonInput('')
                      setShowAddPerson(false)
                    }
                  }}
                >
                  ✓
                </button>
              </div>
            )}
          </div>
        </div>

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

function Detail({ note, update, removeNote, archiveNote, people, addPerson, close, setNotes }: any) {
  const [f, setF] = useState(note)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const debounceRef = useRef<any>(null)
  
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [newChecklist, setNewChecklist] = useState('')

  useEffect(() => {
    setF(note)
    fetchChecklist(note.id).then(setItems)
    fetchActivity(note.id).then(setActivity)
  }, [note])

  const save = (x: any) => {
    setF((old: any) => ({ ...old, ...x }))
    setSaveStatus('saving')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      update(note.id, x)
      setSaveStatus('saved')
    }, 400)
  }

  const colors = ['yellow', 'blue', 'green', 'rose', 'violet']

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-left">
          <small className="modal-tag">DETALLE DE NOTA</small>
          <span className={`save-badge ${saveStatus === 'saving' ? 'save-badge-saving' : 'save-badge-saved'}`}>
            <span className="save-badge-dot" />
            {saveStatus === 'saving' ? 'Guardando…' : 'Guardado'}
          </span>
        </div>
        <div className="detail-header-actions">
          <button onClick={() => {
            const dup: Note = {
              ...f,
              id: crypto.randomUUID(),
              text: f.text + ' (copia)',
              createdAt: new Date().toISOString(),
              completedAt: undefined,
              pinned: false
            }
            setNotes?.((x: Note[]) => [...x, dup])
            enqueue('createNote', undefined, toSheet(dup))
            close()
          }} title="Duplicar nota" className="panel-icon-btn">
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
                <option value={p} key={p}>{p}</option>
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
                  setItems(x => x.map(i => i.id === item.id ? { ...i, done: !i.done } : i))
                  enqueue('updateChecklistItem', item.id, { COMPLETADO: !item.done })
                }}
              />
              <span style={{ textDecoration: item.done ? 'line-through' : 'none', flex: 1 }}>{item.text}</span>
              <button className="btn-detail-action btn-detail-danger" onClick={() => {
                setItems(x => x.filter(i => i.id !== item.id))
                enqueue('deleteChecklistItem', item.id)
              }}><Trash2 size={12} /></button>
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
                  enqueue('createChecklistItem', undefined, { NOTA_ID: note.id, TEXTO: item.text, COMPLETADO: false, ORDEN: item.order })
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
            {activity.length === 0 && <span style={{ fontSize: 12, color: '#666' }}>No hay actividad reciente.</span>}
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
