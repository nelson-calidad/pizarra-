import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutGrid, CalendarDays, Search, Plus, Settings, X,
  User, Users, StickyNote, CalendarClock, LogOut, MoreVertical, Edit3, Trash2
} from 'lucide-react'
import './App.css'

import type {
  Activity, BranchScope, Execution, ExecStatus, Note, PlannerEvent, Role, Section, Person
} from './types'
import {
  enqueue, fetchNotes, fetchPeople, fetchPlanner, getSyncSnapshot,
  mergeWithPending, retryNow, syncListeners, toSheet, type SyncSnapshot,
  getAuthUser, getSessionToken, logout, checkSession, syncSuccessListeners
} from './services/sheetsApi'
import {
  activityToSheet, eventToSheet, executionToSheet
} from './services/mappers'
import { addDays, endOfMonth, startOfMonth, todayISO } from './lib/dates'
import {
  buildExecutions, deduplicateActivities, isHistoricalExecution, pendingMaterialization,
  reconcileAfterRuleChange, ruleChanged, statusPatch
} from './lib/planner'
import { ROLE_LABEL } from './lib/labels'
import type { ActivityTemplate } from './lib/templates'

import { BoardSection, NoteDetail, isNoteOverdue } from './components/BoardSection'
import { AgendaSection } from './components/AgendaSection'
import { ActivityModal } from './components/ActivityModal'
import { ExecutionDetail } from './components/ExecutionDetail'
import { EventsPanel } from './components/EventsPanel'
import { SettingsModal } from './components/SettingsModal'
import { LoginModal } from './components/LoginModal'

const BASE_PEOPLE = ['Nelson', 'Analista']
const LEGACY_REMOVED_PEOPLE = ['Melisa Condori', 'Equipo']

function useSyncSnapshot(): SyncSnapshot {
  const [snap, setSnap] = useState<SyncSnapshot>(() => getSyncSnapshot())
  useEffect(() => {
    const fn = (s: SyncSnapshot) => setSnap(s)
    syncListeners.add(fn)
    return () => {
      syncListeners.delete(fn)
    }
  }, [])
  return snap
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export default function App() {
  const today = todayISO()
  const tomorrow = addDays(today, 1)

  // Navegación principal: únicamente DOS secciones (Agenda y Pizarra). Vista inicial: Agenda (Hoy)
  const [section, setSection] = useState<Section>('agenda')

  // Autenticación individual verificada en Apps Script
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!getAuthUser() && !!getSessionToken()
  })

  // Rol del operador en este dispositivo (RAC o ANALISTA)
  const [currentUser, setCurrentUser] = useState<Role>(() => {
    return getAuthUser() || 'RAC'
  })

  useEffect(() => {
    if (isAuthenticated) {
      void checkSession().then(ok => {
        if (!ok) setIsAuthenticated(false)
      })
    }
  }, [isAuthenticated])

  // Filtros discretos de Agenda (Todos / RAC / Analista · Ambas / Jujuy / Salta)
  const [personFilter, setPersonFilter] = useState<Role | 'TODOS'>('TODOS')
  const [branchFilter, setBranchFilter] = useState<BranchScope | 'TODAS'>('TODAS')
  const [query, setQuery] = useState('')

  // ---------------- Estado de Pizarra (Notas existentes conservadas) ----------------
  const [notes, setNotes] = useState<Note[]>(() => {
    const parsed = loadJSON<Note[]>('mi-tablero-notes', [])
    if (!Array.isArray(parsed)) return []
    let migrated = false
    const updated = parsed.map(n => {
      if (n.assignee === 'Melisa Condori') {
        migrated = true
        return { ...n, assignee: 'Analista' }
      }
      return n
    })
    if (migrated) {
      localStorage.setItem('mi-tablero-notes', JSON.stringify(updated))
    }
    return updated
  })
  const [boardFilter, setBoardFilter] = useState('Pendientes')
  const [activeMember, setActiveMember] = useState<string>('Todos')
  const [people, setPeople] = useState<string[]>(() => {
    const extra = loadJSON<string[]>('mi-tablero-people-extra', [])
    const deleted = new Set(loadJSON<string[]>('mi-tablero-deleted-people', []))
    const validExtra = (Array.isArray(extra) ? extra : []).filter(
      p => !LEGACY_REMOVED_PEOPLE.includes(p) && !deleted.has(p)
    )
    const set = new Set([...BASE_PEOPLE.filter(p => !deleted.has(p)), ...validExtra])
    return Array.from(set)
  })
  const [peopleList, setPeopleList] = useState<Person[]>([])
  const [personMenuOpen, setPersonMenuOpen] = useState<string | null>(null)
  const [personToRemove, setPersonToRemove] = useState<string | null>(null)
  const personMenuRef = useRef<HTMLDivElement>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [noteComposer, setNoteComposer] = useState(false)

  // ---------------- Estado del Planificador Operativo ----------------
  const [activities, setActivities] = useState<Activity[]>(() => {
    const parsed = loadJSON<Activity[]>('mi-tablero-activities', [])
    return Array.isArray(parsed) ? deduplicateActivities(parsed) : []
  })
  const [executions, setExecutions] = useState<Execution[]>(() => {
    const parsed = loadJSON<Execution[]>('mi-tablero-executions', [])
    return Array.isArray(parsed) ? parsed : []
  })
  const [events, setEvents] = useState<PlannerEvent[]>(() => {
    const parsed = loadJSON<PlannerEvent[]>('mi-tablero-events', [])
    return Array.isArray(parsed) ? parsed : []
  })

  // Modales y paneles contextuales
  const [activityModal, setActivityModal] = useState<{
    open: boolean
    initial?: Partial<Activity>
    isEdit?: boolean
  }>({ open: false })
  const [selectedExecId, setSelectedExecId] = useState<string | null>(null)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Persistencia local inmediata
  useEffect(() => {
    localStorage.setItem('mi-tablero-notes', JSON.stringify(notes))
  }, [notes])

  useEffect(() => {
    const extras = people.filter(p => !BASE_PEOPLE.includes(p))
    localStorage.setItem('mi-tablero-people-extra', JSON.stringify(extras))
  }, [people])

  useEffect(() => {
    localStorage.setItem('mi-tablero-activities', JSON.stringify(activities))
  }, [activities])

  useEffect(() => {
    localStorage.setItem('mi-tablero-executions', JSON.stringify(executions))
  }, [executions])

  useEffect(() => {
    localStorage.setItem('mi-tablero-events', JSON.stringify(events))
  }, [events])

  // Materializar en el historial las ocurrencias ya vencidas o del día de hoy
  useEffect(() => {
    const toMat = pendingMaterialization(activities, executions, events, today)
    if (toMat.length === 0) return
    const timer = setTimeout(() => {
      setExecutions(prev => {
        const existing = new Set(prev.map(e => e.id))
        const added = toMat.filter(e => !existing.has(e.id))
        if (!added.length) return prev
        enqueue('batchUpsertExecutions', undefined, added.map(executionToSheet))
        return [...prev, ...added]
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [activities, executions, events, today])

  // Estado de carga inicial remota (evita mostrar la agenda vacía antes de conectar)
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => activities.length === 0)
  const isReloadingPlannerRef = useRef(false)
  const lastReloadPlannerTimeRef = useRef(0)
  const isReloadingSecondaryRef = useRef(false)

  // Prioridad 1: Recarga rápida de Agenda (Planner: actividades + ejecuciones + eventos)
  const reloadPlanner = useCallback(async (force = false) => {
    if (isReloadingPlannerRef.current && !force) return
    const now = Date.now()
    if (!force && now - lastReloadPlannerTimeRef.current < 2500) return

    isReloadingPlannerRef.current = true
    try {
      const freshPlanner = await fetchPlanner()
      if (freshPlanner) {
        if (freshPlanner.activities.length > 0) {
          setActivities(local => deduplicateActivities(mergeWithPending(freshPlanner.activities, local)))
        }
        if (freshPlanner.executions.length > 0) {
          setExecutions(local => mergeWithPending(freshPlanner.executions, local))
        }
        if (freshPlanner.events.length > 0) {
          setEvents(local => mergeWithPending(freshPlanner.events, local))
        }
      }
      lastReloadPlannerTimeRef.current = Date.now()
    } catch {
      // Silencioso; el estado de conexión lo gestiona sheetsApi
    } finally {
      isReloadingPlannerRef.current = false
      setIsInitialLoading(false)
    }
  }, [])

  // Prioridad 2: Recarga secundaria asíncrona (Notas y Personas) sin bloquear Agenda
  const reloadSecondaryData = useCallback(async () => {
    if (isReloadingSecondaryRef.current) return
    isReloadingSecondaryRef.current = true
    try {
      const [freshNotes, freshPeople] = await Promise.all([
        fetchNotes().catch(() => null),
        fetchPeople().catch(() => null)
      ])
      if (freshNotes && freshNotes.length > 0) {
        const migrated = freshNotes.map(n => {
          if (n.assignee === 'Melisa Condori') {
            enqueue('updateNote', n.id, toSheet({ assignee: 'Analista' }))
            return { ...n, assignee: 'Analista' }
          }
          return n
        })
        setNotes(local => mergeWithPending(migrated, local))
      }
      if (freshPeople && freshPeople.length > 0) {
        setPeopleList(freshPeople)
        // Purgar 'Melisa Condori' y 'Equipo' de Sheets si continúan activas en la base remota
        freshPeople.forEach(p => {
          if (LEGACY_REMOVED_PEOPLE.includes(p.name)) {
            enqueue('deletePerson', p.id, { ACTIVO: false })
          }
        })
        const deleted = new Set(loadJSON<string[]>('mi-tablero-deleted-people', []))
        setPeople(prev => {
          const remoteActive = freshPeople
            .filter(x => x.active !== false && !LEGACY_REMOVED_PEOPLE.includes(x.name) && !deleted.has(x.name))
            .map(x => x.name)
          const currentFiltered = prev.filter(p => !LEGACY_REMOVED_PEOPLE.includes(p) && !deleted.has(p))
          const set = new Set([...BASE_PEOPLE.filter(p => !deleted.has(p)), ...currentFiltered, ...remoteActive])
          return Array.from(set)
        })
      }
    } catch {
      // Silencioso
    } finally {
      isReloadingSecondaryRef.current = false
    }
  }, [])

  // 1. Carga inmediata al autenticarse o iniciar la app
  useEffect(() => {
    if (!isAuthenticated) return
    void reloadPlanner(true).then(() => {
      void reloadSecondaryData()
    })
  }, [isAuthenticated, reloadPlanner, reloadSecondaryData])

  // 2. Sincronización rápida entre dispositivos (cada 12s) solo cuando la pestaña esté visible
  useEffect(() => {
    if (!isAuthenticated) return

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reloadPlanner()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void reloadPlanner()
      }
    }, 12000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      clearInterval(timer)
    }
  }, [isAuthenticated, reloadPlanner])

  // 3. Actualización tras operaciones confirmadas en Sheets (para recibir cambios del otro operador)
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const onSyncSuccess = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          void reloadPlanner()
        }
      }, 1500)
    }
    syncSuccessListeners.add(onSyncSuccess)
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      syncSuccessListeners.delete(onSyncSuccess)
    }
  }, [reloadPlanner])

  // 4. Si el usuario abre Pizarra, cargar notas frescas
  useEffect(() => {
    if (section === 'board' && isAuthenticated) {
      void reloadSecondaryData()
    }
  }, [section, isAuthenticated, reloadSecondaryData])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (personMenuRef.current && !personMenuRef.current.contains(e.target as Node)) {
        setPersonMenuOpen(null)
      }
    }
    if (personMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [personMenuOpen])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (section === 'board') setNoteComposer(true)
        else setActivityModal({ open: true })
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if (e.key === 'Escape') {
        setSelectedNote(null)
        setSelectedExecId(null)
        setPaletteOpen(false)
        setNoteComposer(false)
        setActivityModal({ open: false })
        setEventsOpen(false)
        setSettingsOpen(false)
        setPersonMenuOpen(null)
        setPersonToRemove(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section])

  // ---------------- Operaciones de Notas (Pizarra) ----------------
  const updateNote = (id: string, data: Partial<Note>) => {
    const updatedAt = new Date().toISOString()
    setNotes(x => x.map(n => (n.id === id ? { ...n, ...data, updatedAt } : n)))
    enqueue('updateNote', id, toSheet({ ...data, updatedAt }))
  }

  const removeNote = (id: string) => {
    setNotes(x => x.filter(n => n.id !== id))
    if (selectedNote?.id === id) setSelectedNote(null)
    enqueue('deleteNote', id)
  }

  const archiveNote = (id: string) => {
    updateNote(id, { status: 'ARCHIVADO' })
    if (selectedNote?.id === id) setSelectedNote(null)
  }

  const addPerson = (name: string) => {
    const trimmed = name.trim()
    if (trimmed && !people.includes(trimmed)) {
      setPeople(prev => [...prev, trimmed])
      const deleted = loadJSON<string[]>('mi-tablero-deleted-people', [])
      if (deleted.includes(trimmed)) {
        localStorage.setItem(
          'mi-tablero-deleted-people',
          JSON.stringify(deleted.filter(d => d !== trimmed))
        )
      }
      const id = crypto.randomUUID()
      enqueue('createPerson', id, { ID: id, NOMBRE: trimmed, ACTIVO: true })
    }
  }

  const renamePerson = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    if (people.includes(trimmed)) {
      window.alert(`Ya existe una persona con el nombre "${trimmed}".`)
      return
    }
    setPeople(prev => prev.map(p => (p === oldName ? trimmed : p)))
    const now = new Date().toISOString()
    setNotes(list =>
      list.map(n => {
        if (n.assignee === oldName) {
          enqueue('updateNote', n.id, toSheet({ assignee: trimmed, updatedAt: now }))
          return { ...n, assignee: trimmed, updatedAt: now }
        }
        return n
      })
    )
    const meta = peopleList.find(p => p.name.toLowerCase() === oldName.toLowerCase())
    if (meta) {
      enqueue('updatePerson', meta.id, { NOMBRE: trimmed, ACTUALIZADO_EN: now })
    } else {
      enqueue('createPerson', undefined, { NOMBRE: trimmed, ACTUALIZADO_EN: now })
    }
    if (activeMember === oldName) {
      setActiveMember(trimmed)
    }
  }

  const handlePromptRenamePerson = (oldName: string) => {
    const next = window.prompt(`Nuevo nombre para ${oldName}:`, oldName)
    if (next && next.trim()) {
      renamePerson(oldName, next.trim())
    }
  }

  const removePerson = (name: string, reassignTo?: string) => {
    setPeople(prev => prev.filter(p => p !== name))
    const deleted = loadJSON<string[]>('mi-tablero-deleted-people', [])
    if (!deleted.includes(name)) {
      localStorage.setItem('mi-tablero-deleted-people', JSON.stringify([...deleted, name]))
    }
    const now = new Date().toISOString()
    setNotes(list =>
      list.map(n => {
        if (n.assignee === name) {
          const newAssignee = reassignTo ? reassignTo : ''
          enqueue('updateNote', n.id, toSheet({ assignee: newAssignee, updatedAt: now }))
          return { ...n, assignee: reassignTo || undefined, updatedAt: now }
        }
        return n
      })
    )
    const meta = peopleList.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (meta) {
      enqueue('deletePerson', meta.id, { ACTIVO: false, ACTUALIZADO_EN: now })
    }
    if (activeMember === name) {
      setActiveMember('Todos')
    }
    setPersonToRemove(null)
  }

  const createNote = (text: string, date?: string, assignee?: string) => {
    if (!text.trim()) return
    const colIndex = notes.length % 3
    const rowIndex = Math.floor((notes.length % 9) / 3)
    const n: Note = {
      id: crypto.randomUUID(),
      text: text.trim(),
      status: 'PENDIENTE',
      date,
      category: 'General',
      priority: 'NORMAL',
      assignee: assignee || (activeMember !== 'Todos' ? activeMember : undefined),
      color: 'yellow',
      pinned: false,
      x: 80 + colIndex * 280,
      y: 120 + rowIndex * 180,
      width: 264,
      height: 155,
      createdAt: new Date().toISOString()
    }
    setNotes(x => [...x, n])
    enqueue('createNote', n.id, toSheet(n))
    setNoteComposer(false)
    setSelectedNote(n)
  }

  const convertNoteToActivity = (n: Note) => {
    const inferredRole: Role =
      n.assignee &&
      (n.assignee.toLowerCase().includes('melisa') || n.assignee.toLowerCase().includes('analista'))
        ? 'ANALISTA'
        : currentUser
    setSelectedNote(null)
    setActivityModal({
      open: true,
      isEdit: false,
      initial: {
        name: n.text,
        description: n.description,
        frequency: 'UNICA',
        startDate: n.date || today,
        branch: 'AMBAS',
        splitBranches: false,
        responsible: inferredRole,
        sourceNoteId: n.id
      }
    })
  }

  // ---------------- Operaciones de Actividades y Ejecuciones ----------------
  const saveActivity = (data: Omit<Activity, 'id' | 'createdAt'>, existingId?: string) => {
    const now = new Date().toISOString()
    if (existingId) {
      const prev = activities.find(a => a.id === existingId)
      const next: Activity = {
        ...(prev || { id: existingId, createdAt: now }),
        ...data,
        id: existingId,
        // Si cambia la regla de frecuencia, rige desde hoy para no alterar el historial
        effectiveFrom:
          prev && ruleChanged(prev, { ...prev, ...data } as Activity)
            ? today
            : prev?.effectiveFrom,
        updatedAt: now
      }
      setActivities(list => list.map(a => (a.id === existingId ? next : a)))
      enqueue('upsertActivity', next.id, activityToSheet(next))

      if (prev && ruleChanged(prev, next)) {
        const rec = reconcileAfterRuleChange(next, executions, events, today)
        if (rec.remove.length || rec.update.length) {
          setExecutions(curr =>
            curr
              .filter(e => !rec.remove.includes(e.id))
              .map(e => {
                const u = rec.update.find(x => x.id === e.id)
                return u ? { ...e, dueDate: u.dueDate, updatedAt: now } : e
              })
          )
          rec.remove.forEach(id => enqueue('deleteExecution', id))
          rec.update.forEach(u =>
            enqueue('upsertExecution', u.id, { ID: u.id, FECHA: u.dueDate, ACTUALIZADO_EN: now })
          )
        }
      }
    } else {
      const created: Activity = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      }
      setActivities(list => [...list, created])
      enqueue('upsertActivity', created.id, activityToSheet(created))
      if (section === 'board') setSection('agenda')
    }
    setActivityModal({ open: false })
  }

  const quickCreateFromTemplate = (tpl: ActivityTemplate) => {
    const now = new Date().toISOString()
    const created: Activity = {
      ...tpl,
      id: crypto.randomUUID(),
      startDate: today,
      state: 'ACTIVA',
      createdBy: currentUser,
      createdAt: now,
      updatedAt: now
    }
    setActivities(list => [...list, created])
    enqueue('upsertActivity', created.id, activityToSheet(created))
  }

  const handleImportActivities = (toImport: Activity[]) => {
    if (!toImport.length) return
    setActivities(list => [...list, ...toImport])
    enqueue('batchUpsertActivities', undefined, toImport.map(activityToSheet))
  }

  const syncLocalToRemote = () => {
    if (activities.length > 0) {
      enqueue('batchUpsertActivities', undefined, activities.map(activityToSheet))
    }
    const nonVirtualExecs = executions.filter(e => !e.virtual)
    if (nonVirtualExecs.length > 0) {
      enqueue('batchUpsertExecutions', undefined, nonVirtualExecs.map(executionToSheet))
    }
    events.forEach(ev => enqueue('upsertEvent', ev.id, eventToSheet(ev)))
    notes.forEach(n => enqueue('createNote', n.id, toSheet(n)))
  }

  const duplicateActivity = (act: Activity) => {
    setActivityModal({
      open: true,
      isEdit: false,
      initial: {
        ...act,
        id: undefined,
        name: `${act.name} (copia)`,
        effectiveFrom: undefined
      }
    })
  }

  const togglePauseActivity = (act: Activity) => {
    const nextState = act.state === 'PAUSADA' ? 'ACTIVA' : 'PAUSADA'
    const updatedAt = new Date().toISOString()
    const next: Activity = { ...act, state: nextState, updatedAt }
    setActivities(list => list.map(a => (a.id === act.id ? next : a)))
    enqueue('upsertActivity', next.id, activityToSheet(next))
  }

  const deactivateActivity = (act: Activity) => {
    const updatedAt = new Date().toISOString()
    const next: Activity = { ...act, state: 'INACTIVA', updatedAt }
    setActivities(list => list.map(a => (a.id === act.id ? next : a)))
    enqueue('upsertActivity', next.id, activityToSheet(next))

    // Descartar de la cola operativa únicamente ejecuciones pendientes sin valor histórico
    // Conservar intacto el historial: REALIZADA, NO_REALIZADA y observaciones
    const toRemove = executions.filter(
      e => e.activityId === act.id && !e.virtual && !isHistoricalExecution(e)
    )
    setExecutions(list =>
      list.filter(e => !(e.activityId === act.id && !isHistoricalExecution(e)))
    )
    toRemove.forEach(e => enqueue('deleteExecution', e.id))
  }

  const reactivateActivity = (act: Activity) => {
    const updatedAt = new Date().toISOString()
    const next: Activity = {
      ...act,
      state: 'ACTIVA',
      effectiveFrom: today,
      updatedAt
    }
    setActivities(list => list.map(a => (a.id === act.id ? next : a)))
    enqueue('upsertActivity', next.id, activityToSheet(next))

    // Evitar que se generen automáticamente vencimientos antiguos del período en que estuvo eliminada:
    // descartar ejecuciones no realizadas anteriores a hoy que carezcan de valor histórico
    const oldPendingToRemove = executions.filter(
      e => e.activityId === act.id && e.dueDate < today && !isHistoricalExecution(e) && !e.virtual
    )
    if (oldPendingToRemove.length > 0) {
      setExecutions(list =>
        list.filter(e => !(e.activityId === act.id && e.dueDate < today && !isHistoricalExecution(e)))
      )
      oldPendingToRemove.forEach(e => enqueue('deleteExecution', e.id))
    }
  }

  const upsertExecutionLocal = (ex: Execution, patch: Partial<Execution>) => {
    const now = new Date().toISOString()
    const merged: Execution = {
      ...ex,
      ...patch,
      virtual: false,
      updatedAt: now
    }
    setExecutions(list => {
      const idx = list.findIndex(item => item.id === merged.id)
      if (idx === -1) return [...list, merged]
      const copy = list.slice()
      copy[idx] = merged
      return copy
    })
    enqueue('upsertExecution', merged.id, executionToSheet(merged))
  }

  const handleChangeExecStatus = (
    ex: Execution,
    status: ExecStatus,
    extra?: Partial<Execution>
  ) => {
    const basePatch = statusPatch(status, currentUser)
    const patch = {
      ...basePatch,
      ...extra
    }
    upsertExecutionLocal(ex, patch)
  }

  const handleBatchResolveBacklog = (
    items: Execution[],
    status: ExecStatus,
    reason?: string
  ) => {
    if (!items.length) return
    const now = new Date().toISOString()
    const patch = statusPatch(status, currentUser, reason)
    const mergedList: Execution[] = items.map(ex => ({
      ...ex,
      ...patch,
      virtual: false,
      updatedAt: now
    }))
    setExecutions(list => {
      const map = new Map(list.map(e => [e.id, e]))
      for (const m of mergedList) {
        map.set(m.id, m)
      }
      return Array.from(map.values())
    })
    enqueue('batchUpsertExecutions', undefined, mergedList.map(executionToSheet))
  }

  const handleChangeExecutor = (ex: Execution, executor: Role) => {
    upsertExecutionLocal(ex, { executor })
  }

  const handleRescheduleExecution = (ex: Execution, newDate: string) => {
    if (!newDate) return
    upsertExecutionLocal(ex, {
      dueDate: newDate,
      status: ex.status === 'PENDIENTE' ? 'PENDIENTE' : ex.status
    })
  }

  const handleSaveObservation = (ex: Execution, note: string, evidence?: string) => {
    upsertExecutionLocal(ex, { note: note || undefined, evidence })
  }

  // ---------------- Operaciones de Eventos ----------------
  const saveEvent = (data: Omit<PlannerEvent, 'id' | 'createdAt'>, existingId?: string) => {
    const now = new Date().toISOString()
    if (existingId) {
      const next: PlannerEvent = {
        ...data,
        id: existingId,
        createdAt: events.find(e => e.id === existingId)?.createdAt || now,
        updatedAt: now
      }
      setEvents(list => list.map(e => (e.id === existingId ? next : e)))
      enqueue('upsertEvent', next.id, eventToSheet(next))
    } else {
      const created: PlannerEvent = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      }
      setEvents(list => [...list, created])
      enqueue('upsertEvent', created.id, eventToSheet(created))
    }
  }

  const deleteEvent = (id: string) => {
    setEvents(list => list.filter(e => e.id !== id))
    enqueue('deleteEvent', id)
  }

  // ---------------- Datos derivados para Pizarra y Paneles ----------------
  const memberNotes = useMemo(() => {
    if (activeMember === 'Todos') return notes
    return notes.filter(n => n.assignee === activeMember)
  }, [notes, activeMember])

  const pendingNotes = memberNotes.filter(n => n.status === 'PENDIENTE')
  const shownNotes = useMemo(
    () =>
      memberNotes
        .filter(n =>
          boardFilter === 'Pendientes'
            ? n.status === 'PENDIENTE'
            : boardFilter === 'Hoy'
            ? n.status === 'PENDIENTE' && n.date === today
            : boardFilter === 'Vencidos'
            ? isNoteOverdue(n, today)
            : boardFilter === 'Fijadas'
            ? n.pinned && n.status === 'PENDIENTE'
            : boardFilter === 'Hechos'
            ? n.status === 'HECHO'
            : boardFilter === 'Archivados'
            ? n.status === 'ARCHIVADO'
            : boardFilter === 'Todos'
            ? n.status !== 'ARCHIVADO'
            : n.status === 'PENDIENTE'
        )
        .filter(
          n =>
            !query ||
            `${n.text} ${n.category} ${n.assignee || ''}`
              .toLowerCase()
              .includes(query.toLowerCase())
        ),
    [memberNotes, boardFilter, query, today]
  )

  // Contador de ejecuciones pendientes del mes actual para el badge de Agenda
  const currentMonthPendingCount = useMemo(() => {
    const mFrom = startOfMonth(today)
    const mTo = endOfMonth(today)
    const list = buildExecutions(activities, executions, events, mFrom, mTo)
    return list.filter(e => e.status === 'PENDIENTE' || e.status === 'EN_CURSO').length
  }, [activities, executions, events, today])

  // Ejecución seleccionada y su historial
  const selectedExecData = useMemo(() => {
    if (!selectedExecId) return null
    const allRange = buildExecutions(
      activities,
      executions,
      events,
      addDays(today, -365),
      addDays(today, 365)
    )
    const found =
      executions.find(e => e.id === selectedExecId) ||
      allRange.find(e => e.id === selectedExecId)
    if (!found) return null
    const act = activities.find(a => a.id === found.activityId)
    const history = allRange
      .filter(e => e.activityId === found.activityId)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    return { execution: found, activity: act, history }
  }, [selectedExecId, activities, executions, events, today])

  const sync = useSyncSnapshot()

  if (!isAuthenticated) {
    return (
      <LoginModal
        initialUser={currentUser}
        onLoginSuccess={user => {
          setCurrentUser(user)
          setIsAuthenticated(true)
        }}
      />
    )
  }

  return (
    <div className="app">
      {/* BARRA LATERAL MINIMALISTA: ÚNICAMENTE 2 SECCIONES (AGENDA Y PIZARRA) */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">A</div>
          <div className="brand-info">
            <span className="brand-title">Calidad Autosol</span>
            <span className="brand-sub">Jujuy · Salta</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          <button
            type="button"
            className={`nav-item ${section === 'agenda' ? 'active' : ''}`}
            onClick={() => setSection('agenda')}
          >
            <span className="nav-icon">
              <CalendarDays size={18} strokeWidth={1.9} />
            </span>
            <span className="nav-label">Agenda</span>
            {currentMonthPendingCount > 0 && (
              <em className="badge-count">{currentMonthPendingCount}</em>
            )}
          </button>

          <button
            type="button"
            className={`nav-item ${section === 'board' ? 'active' : ''}`}
            onClick={() => setSection('board')}
          >
            <span className="nav-icon">
              <LayoutGrid size={18} strokeWidth={1.9} />
            </span>
            <span className="nav-label">Pizarra</span>
            {pendingNotes.length > 0 && (
              <em className="badge-count badge-subtle">{pendingNotes.length}</em>
            )}
          </button>
        </nav>

        {/* Filtros contextuales según la sección activa */}
        {section === 'board' ? (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">NOTAS POR PERSONA</span>
              <button
                className="btn-add-member-small"
                onClick={() => {
                  const name = window.prompt('Nombre del miembro del equipo:')
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
                const count = notes.filter(
                  n => n.status === 'PENDIENTE' && n.assignee === p
                ).length
                const isSelected = activeMember === p
                return (
                  <div
                    key={p}
                    className={`person-tab-row ${isSelected ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      className="person-tab-btn"
                      onClick={() => setActiveMember(p)}
                    >
                      <User size={15} strokeWidth={1.9} />
                      <span className="workspace-tab-name">{p}</span>
                      {count > 0 && <span className="workspace-tab-count">{count}</span>}
                    </button>
                    <button
                      type="button"
                      className="person-menu-btn"
                      onClick={e => {
                        e.stopPropagation()
                        setPersonMenuOpen(personMenuOpen === p ? null : p)
                      }}
                      title={`Opciones de ${p}`}
                      aria-label={`Opciones de ${p}`}
                    >
                      <MoreVertical size={13} strokeWidth={2} />
                    </button>
                    {personMenuOpen === p && (
                      <div className="person-context-menu" ref={personMenuRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setPersonMenuOpen(null)
                            handlePromptRenamePerson(p)
                          }}
                        >
                          <Edit3 size={13} />
                          <span>Renombrar</span>
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setPersonMenuOpen(null)
                            setPersonToRemove(p)
                          }}
                        >
                          <Trash2 size={13} />
                          <span>Quitar persona</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">SUCURSAL</span>
            </div>
            <div className="workspace-tabs-list">
              <button
                type="button"
                className={`workspace-tab-item ${branchFilter === 'TODAS' ? 'active' : ''}`}
                onClick={() => setBranchFilter('TODAS')}
              >
                <span className="cat-dot" style={{ background: '#6366f1' }} />
                <span className="workspace-tab-name">Todas</span>
              </button>
              <button
                type="button"
                className={`workspace-tab-item ${branchFilter === 'JUJUY' ? 'active' : ''}`}
                onClick={() => setBranchFilter(b => (b === 'JUJUY' ? 'TODAS' : 'JUJUY'))}
              >
                <span className="cat-dot" style={{ background: '#0284c7' }} />
                <span className="workspace-tab-name">Jujuy</span>
              </button>
              <button
                type="button"
                className={`workspace-tab-item ${branchFilter === 'SALTA' ? 'active' : ''}`}
                onClick={() => setBranchFilter(b => (b === 'SALTA' ? 'TODAS' : 'SALTA'))}
              >
                <span className="cat-dot" style={{ background: '#ea580c' }} />
                <span className="workspace-tab-name">Salta</span>
              </button>
            </div>
          </div>
        )}

        <footer className="sidebar-footer">
          <div className="footer-status" title={sync.lastError || ''}>
            {sync.status === 'idle' && (
              <>
                <span className="status-indicator" />
                <span>Guardado en Sheets</span>
              </>
            )}
            {sync.status === 'local' && (
              <>
                <span className="status-indicator status-local" />
                <span>Guardado local</span>
              </>
            )}
            {(sync.status === 'saving' || sync.status === 'pending') && (
              <>
                <span className="status-indicator status-saving" />
                <span>Guardando{sync.pending > 1 ? ` (${sync.pending})` : ''}…</span>
              </>
            )}
            {sync.status === 'offline' && (
              <>
                <span className="status-indicator status-error" />
                <span>Sin conexión — {sync.pending} {sync.pending === 1 ? 'pendiente' : 'pendientes'}</span>
              </>
            )}
            {sync.status === 'auth' && (
              <>
                <span className="status-indicator status-error" />
                <button onClick={() => setIsAuthenticated(false)}>Acceso requerido</button>
              </>
            )}
            {sync.status === 'error' && (
              <>
                <span className="status-indicator status-error" />
                <span>
                  Error de guardado —{' '}
                  <button onClick={retryNow}>Reintentar</button>
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            className="footer-action"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={15} strokeWidth={1.8} />
            <span>Configuración</span>
          </button>
        </footer>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="main-content">
        <header className="app-header">
          <div className="header-left-controls">
            {/* Usuario autenticado discreto y botón de cerrar sesión */}
            <div className="header-user-pill" title={`Sesión activa: ${ROLE_LABEL[currentUser]}`}>
              <span className="user-disc-badge">{currentUser === 'RAC' ? 'R' : 'A'}</span>
              <span className="user-name-label">{ROLE_LABEL[currentUser]}</span>
              <button
                type="button"
                className="btn-header-logout"
                onClick={async () => {
                  await logout()
                  setIsAuthenticated(false)
                }}
                title="Cerrar sesión"
              >
                <LogOut size={13} />
                <span>Salir</span>
              </button>
            </div>
          </div>

          <div className="header-search-wrap">
            <Search size={16} strokeWidth={1.9} className="search-icon" />
            <input
              className="header-search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={
                section === 'board'
                  ? 'Buscar en notas de la pizarra…'
                  : 'Buscar actividad, observación o categoría…'
              }
            />
            {query ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery('')}
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="search-keycap" onClick={() => setPaletteOpen(true)}>
                Ctrl K
              </kbd>
            )}
          </div>

          <div className="header-actions-group">
            <button
              type="button"
              className="btn-header-secondary"
              onClick={() => setNoteComposer(true)}
              title="Anotar algo rápido en la Pizarra"
            >
              <StickyNote size={15} strokeWidth={2} />
              <span>Nueva nota</span>
            </button>
            <button
              type="button"
              className="btn-new-note"
              onClick={() => setActivityModal({ open: true })}
            >
              <Plus size={16} strokeWidth={2.4} />
              <span>+ Nueva actividad</span>
            </button>
          </div>
        </header>

        <div className="view-container">
          {section === 'board' && (
            <BoardSection
              notes={shownNotes}
              allMemberNotes={memberNotes}
              archivedCount={notes.filter(n => n.status === 'ARCHIVADO').length}
              today={today}
              filter={boardFilter}
              setFilter={setBoardFilter}
              counts={[
                memberNotes.filter(n => n.status !== 'ARCHIVADO').length,
                pendingNotes.length,
                pendingNotes.filter(n => n.date === today).length,
                pendingNotes.filter(n => isNoteOverdue(n, today)).length,
                memberNotes.filter(n => n.pinned && n.status !== 'ARCHIVADO').length,
                memberNotes.filter(n => n.status === 'HECHO').length
              ]}
              query={query}
              setQuery={setQuery}
              update={updateNote}
              removeNote={removeNote}
              select={setSelectedNote}
              onConvertToActivity={convertNoteToActivity}
              people={people}
              activeMember={activeMember}
              setActiveMember={setActiveMember}
            />
          )}

          {section === 'agenda' && (
            <AgendaSection
              activities={activities}
              persistedExecutions={executions}
              events={events}
              notes={notes}
              today={today}
              currentUser={currentUser}
              personFilter={personFilter}
              onPersonFilterChange={setPersonFilter}
              branchFilter={branchFilter}
              onBranchFilterChange={setBranchFilter}
              query={query}
              onChangeStatus={handleChangeExecStatus}
              onBatchResolveBacklog={handleBatchResolveBacklog}
              onChangeExecutor={handleChangeExecutor}
              onRescheduleExecution={handleRescheduleExecution}
              onSaveObservation={handleSaveObservation}
              onSelectExecution={ex => setSelectedExecId(ex.id)}
              onSelectNote={n => setSelectedNote(n)}
              onOpenNewActivity={prefill =>
                setActivityModal({ open: true, initial: prefill, isEdit: false })
              }
              onEditActivity={act =>
                setActivityModal({ open: true, initial: act, isEdit: true })
              }
              onDuplicateActivity={duplicateActivity}
              onTogglePauseActivity={togglePauseActivity}
              onDeleteActivity={deactivateActivity}
              onRestoreActivity={reactivateActivity}
              onOpenEvents={() => setEventsOpen(true)}
              onQuickCreateTemplate={quickCreateFromTemplate}
              onImportActivities={handleImportActivities}
              isLoading={isInitialLoading}
            />
          )}
        </div>
      </main>

      {/* MODAL RÁPIDO DE NOTA DE PIZARRA */}
      {noteComposer && (
        <NoteComposer
          today={today}
          tomorrow={tomorrow}
          close={() => setNoteComposer(false)}
          create={createNote}
          people={people}
          addPerson={addPerson}
          defaultAssignee={activeMember !== 'Todos' ? activeMember : ''}
        />
      )}

      {/* MODAL CONFIRMACIÓN QUITAR PERSONA */}
      {personToRemove && (
        <RemovePersonModal
          personName={personToRemove}
          assignedCount={notes.filter(n => n.assignee === personToRemove).length}
          otherPeople={people.filter(p => p !== personToRemove)}
          onConfirm={reassignTo => removePerson(personToRemove, reassignTo)}
          onCancel={() => setPersonToRemove(null)}
        />
      )}

      {/* MODAL DE NUEVA / EDITAR ACTIVIDAD */}
      {activityModal.open && (
        <ActivityModal
          initial={activityModal.initial}
          isEdit={activityModal.isEdit}
          defaultRole={currentUser}
          onSave={saveActivity}
          onClose={() => setActivityModal({ open: false })}
        />
      )}

      {/* PANEL CONTEXTUAL DE AUDITORÍAS Y CIERRES */}
      {eventsOpen && (
        <EventsPanel
          events={events}
          activities={activities}
          currentUser={currentUser}
          onSaveEvent={saveEvent}
          onDeleteEvent={deleteEvent}
          onCreateLinkedActivity={data => saveActivity(data)}
          onClose={() => setEventsOpen(false)}
        />
      )}

      {/* PANEL LATERAL DE DETALLE DE EJECUCIÓN */}
      {selectedExecData && (
        <ExecutionDetail
          key={selectedExecData.execution.id}
          execution={selectedExecData.execution}
          activity={selectedExecData.activity}
          history={selectedExecData.history}
          today={today}
          currentUser={currentUser}
          onUpdateExecution={upsertExecutionLocal}
          onChangeStatus={handleChangeExecStatus}
          onEditActivity={act =>
            setActivityModal({ open: true, initial: act, isEdit: true })
          }
          onDuplicateActivity={duplicateActivity}
          onTogglePauseActivity={togglePauseActivity}
          onDeleteActivity={deactivateActivity}
          onSelectExecution={ex => setSelectedExecId(ex.id)}
          onClose={() => setSelectedExecId(null)}
        />
      )}

      {/* PANEL LATERAL DE DETALLE DE NOTA (PIZARRA) */}
      {selectedNote && (
        <NoteDetail
          key={selectedNote.id}
          note={notes.find(n => n.id === selectedNote.id) || selectedNote}
          update={updateNote}
          removeNote={removeNote}
          archiveNote={archiveNote}
          onConvertToActivity={convertNoteToActivity}
          people={people}
          addPerson={addPerson}
          close={() => setSelectedNote(null)}
          setNotes={setNotes}
        />
      )}

      {/* CONFIGURACIÓN Y CONEXIÓN */}
      {settingsOpen && (
        <SettingsModal
          sync={sync}
          currentUser={currentUser}
          onChangeCurrentUser={setCurrentUser}
          notes={notes}
          activities={activities}
          executions={executions}
          events={events}
          onClose={() => setSettingsOpen(false)}
          onSyncLocalToRemote={syncLocalToRemote}
        />
      )}

      {/* PALETA DE BÚSQUEDA Y COMANDOS RÁPIDOS (Ctrl+K) */}
      {paletteOpen && (
        <QuickPalette
          notes={notes}
          activities={activities}
          close={() => setPaletteOpen(false)}
          onSelectNote={n => {
            setSection('board')
            setSelectedNote(n)
            setPaletteOpen(false)
          }}
          onSelectActivity={a => {
            setSection('agenda')
            setActivityModal({ open: true, initial: a, isEdit: true })
            setPaletteOpen(false)
          }}
          onGoSection={s => {
            setSection(s)
            setPaletteOpen(false)
          }}
          onNewActivity={() => {
            setPaletteOpen(false)
            setActivityModal({ open: true })
          }}
          onNewNote={() => {
            setPaletteOpen(false)
            setNoteComposer(true)
          }}
          onOpenEvents={() => {
            setPaletteOpen(false)
            setEventsOpen(true)
          }}
        />
      )}
    </div>
  )
}

function NoteComposer({
  today,
  tomorrow,
  close,
  create,
  people,
  addPerson,
  defaultAssignee
}: {
  today: string
  tomorrow: string
  close: () => void
  create: (text: string, date?: string, assignee?: string) => void
  people: string[]
  addPerson: (name: string) => void
  defaultAssignee: string
}) {
  const [text, setText] = useState('')
  const [date, setDate] = useState<string | undefined>()
  const [assignee, setAssignee] = useState<string>(defaultAssignee || '')
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
        <small className="modal-tag">NUEVA NOTA RÁPIDA EN PIZARRA</small>
        <input
          autoFocus
          className="composer-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="¿Qué querés anotar o recordar?"
        />

        <div className="composer-assignee-row">
          <span className="composer-label">
            <User size={13} strokeWidth={2} /> Para:
          </span>
          <div className="composer-assignee-pills">
            <button
              type="button"
              className={`pill-assignee ${!assignee ? 'pill-assignee-active' : ''}`}
              onClick={() => setAssignee('')}
            >
              General
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
              onClick={() => setDate(date === today ? undefined : today)}
            >
              Hoy
            </button>
            <button
              type="button"
              className={date === tomorrow ? 'btn-date-selected' : ''}
              onClick={() => setDate(date === tomorrow ? undefined : tomorrow)}
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

function QuickPalette({
  notes,
  activities,
  close,
  onSelectNote,
  onSelectActivity,
  onGoSection,
  onNewActivity,
  onNewNote,
  onOpenEvents
}: {
  notes: Note[]
  activities: Activity[]
  close: () => void
  onSelectNote: (n: Note) => void
  onSelectActivity: (a: Activity) => void
  onGoSection: (s: Section) => void
  onNewActivity: () => void
  onNewNote: () => void
  onOpenEvents: () => void
}) {
  const [q, setQ] = useState('')
  const noteHits = notes
    .filter(n =>
      `${n.text} ${n.category} ${n.description || ''}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
    .slice(0, 4)
  const actHits = activities
    .filter(a =>
      `${a.name} ${a.category || ''} ${a.description || ''}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
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
            placeholder="Buscar actividad, nota de pizarra o comando…"
          />
        </div>
        <small className="modal-tag">ACCIONES Y SECCIONES</small>
        <div className="palette-nav-list">
          <button className="palette-cmd-btn" onClick={onNewActivity}>
            <span>+ Nueva actividad operativa</span>
            <kbd className="cmd-kbd">Crear</kbd>
          </button>
          <button className="palette-cmd-btn" onClick={onNewNote}>
            <span>+ Nueva nota rápida en Pizarra</span>
            <kbd className="cmd-kbd">Nota</kbd>
          </button>
          <button className="palette-cmd-btn" onClick={onOpenEvents}>
            <span>
              <CalendarClock size={13} style={{ verticalAlign: 'middle' }} /> Registrar fecha de PCGC / cierre oficial
            </span>
            <kbd className="cmd-kbd">Evento</kbd>
          </button>
          {(
            [
              ['agenda', 'Ir a Agenda'],
              ['board', 'Ir a Pizarra']
            ] as [Section, string][]
          ).map(([s, label]) => (
            <button className="palette-cmd-btn" onClick={() => onGoSection(s)} key={s}>
              <span>{label}</span>
              <kbd className="cmd-kbd">Ir</kbd>
            </button>
          ))}
        </div>

        {actHits.length > 0 && (
          <>
            <small className="modal-tag">ACTIVIDADES</small>
            <div className="palette-hits-list">
              {actHits.map(a => (
                <button
                  className="palette-hit-item"
                  onClick={() => onSelectActivity(a)}
                  key={a.id}
                >
                  <span className="hit-text">{a.name}</span>
                  <i className="hit-cat">{a.frequency}</i>
                </button>
              ))}
            </div>
          </>
        )}

        {noteHits.length > 0 && (
          <>
            <small className="modal-tag">NOTAS DE PIZARRA</small>
            <div className="palette-hits-list">
              {noteHits.map(n => (
                <button
                  className="palette-hit-item"
                  onClick={() => onSelectNote(n)}
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

function RemovePersonModal({
  personName,
  assignedCount,
  otherPeople,
  onConfirm,
  onCancel
}: {
  personName: string
  assignedCount: number
  otherPeople: string[]
  onConfirm: (reassignTo?: string) => void
  onCancel: () => void
}) {
  const [reassignTarget, setReassignTarget] = useState<string>('')

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal-compact"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className="modal-header">
          <div>
            <span className="modal-tag">PERSONAS</span>
            <h2 className="modal-title" style={{ fontSize: 16 }}>
              Quitar a {personName}
            </h2>
          </div>
          <button type="button" className="btn-icon" onClick={onCancel} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div
          className="modal-body"
          style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {assignedCount > 0 ? (
            <>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)' }}>
                Esta persona tiene{' '}
                <strong>
                  {assignedCount} {assignedCount === 1 ? 'nota asignada' : 'notas asignadas'}
                </strong>{' '}
                en la Pizarra.
              </p>
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--text-secondary)'
                }}
              >
                <span>¿Qué deseás hacer con sus notas?</span>
                <select
                  value={reassignTarget}
                  onChange={e => setReassignTarget(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontSize: 13.5,
                    color: 'var(--text)'
                  }}
                >
                  <option value="">Dejar sin responsable (visibles en General)</option>
                  {otherPeople.map(p => (
                    <option key={p} value={p}>
                      Reasignar a {p}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)' }}>
              ¿Estás seguro de quitar a <strong>{personName}</strong> del listado de personas?
            </p>
          )}

          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              background: 'var(--surface-active, #f8fafc)',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-soft)'
            }}
          >
            ℹ️ Las notas nunca se eliminarán de la Pizarra.
          </div>
        </div>

        <div
          className="modal-footer"
          style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}
        >
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-danger"
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '7px 14px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
            onClick={() => onConfirm(reassignTarget || undefined)}
          >
            Quitar persona
          </button>
        </div>
      </div>
    </div>
  )
}
