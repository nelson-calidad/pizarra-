import type { Note, ChecklistItem, Person, ActivityEntry } from '../types'

const apiUrl = import.meta.env.VITE_GOOGLE_SCRIPT_URL as string | undefined

// ---- MAPPING ----

export const toSheet = (n: Partial<Note>) =>
  Object.fromEntries(
    Object.entries(n).map(([k, v]) => [
      ({
        id: 'ID', text: 'TEXTO', description: 'DESCRIPCION',
        status: 'ESTADO', date: 'FECHA', time: 'HORA',
        category: 'CATEGORIA', priority: 'PRIORIDAD',
        assignee: 'RESPONSABLE', color: 'COLOR', pinned: 'FIJADA',
        x: 'X', y: 'Y', width: 'ANCHO', height: 'ALTO',
        createdAt: 'CREADO_EN', updatedAt: 'ACTUALIZADO_EN',
        completedAt: 'COMPLETADO_EN'
      } as Record<string, string>)[k] || k.toUpperCase(),
      v
    ])
  )

const normalizeDate = (d?: unknown): string | undefined => {
  if (!d || typeof d !== 'string') return undefined
  const t = d.trim()
  if (!t) return undefined
  if (t.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return t
}

export const fromSheet = (n: Record<string, unknown>): Note => ({
  id: n.ID as string,
  text: (n.TEXTO as string) || '',
  description: (n.DESCRIPCION as string) || '',
  status: (n.ESTADO as string || 'PENDIENTE') as Note['status'],
  date: normalizeDate(n.FECHA),
  time: (n.HORA as string) || undefined,
  category: (n.CATEGORIA as string) || 'General',
  priority: (n.PRIORIDAD as string) || 'NORMAL',
  assignee: (n.RESPONSABLE as string) || undefined,
  color: (n.COLOR as string) || 'yellow',
  pinned: n.FIJADA === true || n.FIJADA === 'TRUE',
  x: Math.max(0, Number(n.X) || 120),
  y: Math.max(0, Number(n.Y) || 120),
  width: Number(n.ANCHO) || 264,
  height: Number(n.ALTO) || 155,
  createdAt: (n.CREADO_EN as string) || new Date().toISOString(),
  updatedAt: (n.ACTUALIZADO_EN as string) || undefined,
  completedAt: (n.COMPLETADO_EN as string) || undefined,
})

export const fromSheetPerson = (n: Record<string, unknown>): Person => ({
  id: (n.ID as string),
  name: (n.NOMBRE as string) || '',
  active: n.ACTIVO === true || n.ACTIVO === 'TRUE' || n.ACTIVO === undefined || n.ACTIVO === '',
  order: Number(n.ORDEN) || 0,
  createdAt: (n.CREADO_EN as string) || new Date().toISOString(),
})

export const fromSheetActivity = (n: Record<string, unknown>): ActivityEntry => ({
  id: (n.ID as string),
  noteId: (n.NOTA_ID as string) || '',
  action: (n.ACCION as string) || '',
  detail: (n.DETALLE as string) || '',
  before: (n.ANTES as string) || undefined,
  after: (n.DESPUES as string) || undefined,
  actor: (n.ACTOR as string) || undefined,
  createdAt: (n.CREADO_EN as string) || new Date().toISOString(),
})

export const fromSheetChecklist = (n: Record<string, unknown>): ChecklistItem => ({
  id: (n.ID as string),
  noteId: (n.NOTA_ID as string) || '',
  text: (n.TEXTO as string) || '',
  done: n.COMPLETADO === true || n.COMPLETADO === 'TRUE',
  order: Number(n.ORDEN) || 0,
})

// ---- SYNC QUEUE ----

type QueuedOp = { action: string; id?: string; data?: unknown; retries: number }
const queue: QueuedOp[] = []
let flushing = false
export let syncStatus: 'idle' | 'saving' | 'error' | 'offline' = 'idle'
export const syncListeners: Set<(s: typeof syncStatus) => void> = new Set()
const notify = (s: typeof syncStatus) => { syncStatus = s; syncListeners.forEach(l => l(s)) }

async function flushQueue() {
  if (flushing || !queue.length || !apiUrl) return
  flushing = true
  notify('saving')
  while (queue.length) {
    const op = queue[0]
    try {
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: op.action, id: op.id, data: op.data })
      }).then(x => x.json())
      if (!r.success) throw new Error(r.error || 'Error')
      queue.shift()
    } catch {
      op.retries = (op.retries || 0) + 1
      if (!navigator.onLine || op.retries > 5) {
        notify('offline')
        break
      }
      await new Promise(r => setTimeout(r, Math.min(2000 * op.retries, 15000)))
    }
  }
  flushing = false
  notify(queue.length ? 'error' : 'idle')
}

export function enqueue(action: string, id?: string, data?: unknown) {
  if (!apiUrl) return
  queue.push({ action, id, data, retries: 0 })
  void flushQueue()
}

export function retryNow() {
  flushing = false
  void flushQueue()
}

export function hasPending() { return queue.length > 0 }

// ---- API CALLS ----

export async function fetchNotes(): Promise<Note[]> {
  if (!apiUrl) return []
  const r = await fetch(`${apiUrl}?action=getNotes`).then(x => x.json())
  return r.success && Array.isArray(r.data) ? r.data.map(fromSheet) : []
}

export async function fetchPeople(): Promise<Person[]> {
  if (!apiUrl) return []
  const r = await fetch(`${apiUrl}?action=getPeople`).then(x => x.json())
  return r.success && Array.isArray(r.data) ? r.data.map(fromSheetPerson) : []
}

export async function fetchActivity(noteId?: string): Promise<ActivityEntry[]> {
  if (!apiUrl) return []
  const url = noteId ? `${apiUrl}?action=getActivity&noteId=${noteId}` : `${apiUrl}?action=getActivity`
  const r = await fetch(url).then(x => x.json())
  return r.success && Array.isArray(r.data) ? r.data.map(fromSheetActivity) : []
}

export async function fetchChecklist(noteId: string): Promise<ChecklistItem[]> {
  if (!apiUrl) return []
  const r = await fetch(`${apiUrl}?action=getChecklist&noteId=${noteId}`).then(x => x.json())
  return r.success && Array.isArray(r.data) ? r.data.map(fromSheetChecklist) : []
}
