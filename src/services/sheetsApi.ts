// Sincronización con Google Sheets (Apps Script).
// - La cola de cambios se guarda en localStorage: no se pierde al recargar ni sin conexión.
// - "Sincronizado" sólo se informa cuando la cola está vacía y Sheets confirmó todo.
// - La URL y la clave de acceso se configuran en la app (no se compilan secretos en el frontend).

import type { Note, ChecklistItem, Person, ActivityEntry, PlannerData, SyncOp, SyncStatus } from '../types'
import {
  fromSheet, fromSheetPerson, fromSheetActivity, fromSheetChecklist,
  activityFromSheet, executionFromSheet, eventFromSheet
} from './mappers'

export { toSheet } from './mappers'

const LS_URL = 'mi-tablero-api-url'
const LS_KEY = 'mi-tablero-api-key'
const LS_QUEUE = 'mi-tablero-sync-queue'
const LS_FAILED = 'mi-tablero-sync-failed'

const envUrl = (import.meta.env?.VITE_GOOGLE_SCRIPT_URL as string | undefined) || ''

const ls = {
  get(k: string) {
    try { return globalThis.localStorage?.getItem(k) ?? null } catch { return null }
  },
  set(k: string, v: string) {
    try { globalThis.localStorage?.setItem(k, v) } catch { /* almacenamiento lleno o bloqueado */ }
  },
  del(k: string) {
    try { globalThis.localStorage?.removeItem(k) } catch { /* noop */ }
  }
}

const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwP0uhG6nsbdIKbx-M6kQjQAV5tIyJcxR0tcgpiZqu4QFDtMOALfN3gMFW8PiXt2Tr6/exec'

export function getApiUrl(): string {
  return (ls.get(LS_URL) || envUrl || DEFAULT_URL).trim()
}
export function getAccessKey(): string {
  return (ls.get(LS_KEY) || '').trim()
}
export function setConnection(url: string, key: string) {
  if (url.trim() && url.trim() !== envUrl) ls.set(LS_URL, url.trim())
  else ls.del(LS_URL)
  if (key.trim()) ls.set(LS_KEY, key.trim())
  else ls.del(LS_KEY)
  authFailed = false
  notify()
  void flushQueue()
}
export const isRemoteEnabled = () => !!getApiUrl()

// ---------------- Cola persistente ----------------

const loadList = (k: string): SyncOp[] => {
  try {
    const raw = ls.get(k)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

let queue: SyncOp[] = loadList(LS_QUEUE)
let failed: SyncOp[] = loadList(LS_FAILED)
let flushing = false
let offline = false
let authFailed = false
let lastError = ''
let retryTimer: ReturnType<typeof setTimeout> | null = null

const persist = () => {
  ls.set(LS_QUEUE, JSON.stringify(queue))
  ls.set(LS_FAILED, JSON.stringify(failed))
}

export type SyncSnapshot = {
  status: SyncStatus
  pending: number
  failed: number
  lastError: string
}

export const syncListeners: Set<(s: SyncSnapshot) => void> = new Set()

export function getSyncSnapshot(): SyncSnapshot {
  let status: SyncStatus
  if (!isRemoteEnabled()) status = 'local'
  else if (authFailed) status = 'auth'
  else if (flushing) status = 'saving'
  else if (offline && queue.length) status = 'offline'
  else if (failed.length) status = 'error'
  else if (queue.length) status = lastError ? 'error' : 'pending'
  else status = 'idle'
  return { status, pending: queue.length, failed: failed.length, lastError }
}

const notify = () => {
  const s = getSyncSnapshot()
  syncListeners.forEach(l => l(s))
}

const scheduleRetry = (ms: number) => {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => { retryTimer = null; void flushQueue() }, ms)
}

type ApiResponse = { success: boolean; data?: unknown; error?: string; code?: number }

class NetworkError extends Error {}
class AuthError extends Error {}

async function post(body: Record<string, unknown>): Promise<ApiResponse> {
  const url = getApiUrl()
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain evita el preflight CORS que Apps Script no soporta.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, key: getAccessKey() || undefined })
    })
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : 'Sin conexión')
  }
  let json: ApiResponse
  try {
    json = await res.json()
  } catch {
    throw new NetworkError('Respuesta inválida del servidor')
  }
  if (!json.success && (json.code === 401 || json.error === 'NO_AUTORIZADO')) throw new AuthError('Clave de acceso inválida')
  return json
}

/** Errores definitivos (no tiene sentido reintentar). */
const isPermanent = (err: string) => /no encontrad|no reconocida|inválid/i.test(err)

export async function flushQueue(): Promise<void> {
  if (flushing || !queue.length || !isRemoteEnabled() || authFailed) {
    notify()
    return
  }
  flushing = true
  notify()
  while (queue.length) {
    const op = queue[0]
    try {
      const r = await post({ action: op.action, id: op.id, data: op.data })
      if (!r.success) {
        const msg = r.error || 'Error desconocido'
        op.retries = (op.retries || 0) + 1
        op.lastError = msg
        if (op.action === 'batchUpsertActivities' && /no reconocid/i.test(msg)) {
          const list = Array.isArray(op.data) ? (op.data as Record<string, unknown>[]) : []
          queue.shift()
          const individualOps: SyncOp[] = list.map(item => ({
            opId: crypto.randomUUID(),
            action: 'upsertActivity',
            id: item?.ID ? String(item.ID) : undefined,
            data: item,
            retries: 0,
            createdAt: new Date().toISOString()
          }))
          queue.unshift(...individualOps)
          persist()
          continue
        }
        if (isPermanent(msg) || op.retries >= 4) {
          // Se aparta para no bloquear la cola; queda visible en Configuración.
          failed.push(queue.shift()!)
          persist()
          continue
        }
        lastError = msg
        persist()
        scheduleRetry(Math.min(3000 * op.retries, 30000))
        break
      }
      queue.shift()
      offline = false
      lastError = ''
      persist()
    } catch (e) {
      if (e instanceof AuthError) {
        authFailed = true
        lastError = e.message
        break
      }
      offline = true
      op.retries = (op.retries || 0) + 1
      lastError = e instanceof Error ? e.message : 'Error de red'
      persist()
      scheduleRetry(Math.min(4000 * op.retries, 60000))
      break
    }
  }
  flushing = false
  notify()
}

export function enqueue(action: string, id?: string, data?: unknown) {
  if (!isRemoteEnabled()) return
  queue.push({ opId: crypto.randomUUID(), action, id, data, retries: 0, createdAt: new Date().toISOString() })
  persist()
  void flushQueue()
}

export function retryNow() {
  offline = false
  lastError = ''
  for (const op of queue) op.retries = 0
  void flushQueue()
}

/** Vuelve a intentar los cambios apartados por error. */
export function retryFailed() {
  queue.push(...failed.map(f => ({ ...f, retries: 0 })))
  failed = []
  persist()
  retryNow()
}

export function discardFailed() {
  failed = []
  persist()
  notify()
}

export function getFailedOps() {
  return failed.slice()
}

export function hasPending() {
  return queue.length > 0
}

const opEntityIds = (op: SyncOp): string[] => {
  const ids: string[] = []
  if (op.id) ids.push(op.id)
  const d = op.data as Record<string, unknown> | Record<string, unknown>[] | undefined
  if (Array.isArray(d)) d.forEach(x => x && typeof x.ID === 'string' && ids.push(x.ID))
  else if (d && typeof d.ID === 'string') ids.push(d.ID)
  return ids
}

/** IDs de registros con cambios locales todavía no confirmados por Sheets. */
export function pendingIds(): Set<string> {
  const s = new Set<string>()
  for (const op of queue) opEntityIds(op).forEach(i => s.add(i))
  return s
}

export function pendingDeletes(): Set<string> {
  const s = new Set<string>()
  for (const op of queue) if (op.action.startsWith('delete') && op.id) s.add(op.id)
  return s
}

/**
 * Combina datos frescos del servidor con los locales sin perder cambios pendientes:
 * los registros con operaciones en cola conservan su versión local.
 */
export function mergeWithPending<T extends { id: string }>(fresh: T[], local: T[]): T[] {
  const pend = pendingIds()
  const dels = pendingDeletes()
  const localById = new Map(local.map(x => [x.id, x]))
  const out: T[] = []
  const seen = new Set<string>()
  for (const f of fresh) {
    if (!f.id || seen.has(f.id) || dels.has(f.id)) continue
    seen.add(f.id)
    out.push(pend.has(f.id) && localById.has(f.id) ? localById.get(f.id)! : f)
  }
  for (const l of local) {
    if (!seen.has(l.id) && !dels.has(l.id) && pend.has(l.id)) {
      seen.add(l.id)
      out.push(l)
    }
  }
  return out
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => retryNow())
  window.addEventListener('offline', () => { offline = true; notify() })
  // Reintento periódico mientras haya cambios en cola.
  setInterval(() => { if (queue.length && !flushing) void flushQueue() }, 30000)
}

// ---------------- Lecturas ----------------

async function get(action: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = getApiUrl()
  if (!url) return null
  const qs = new URLSearchParams({ action, ...params })
  const key = getAccessKey()
  if (key) qs.set('key', key)
  let r: ApiResponse
  try {
    r = await fetch(`${url}?${qs.toString()}`).then(x => x.json())
  } catch (e) {
    offline = true
    notify()
    throw e
  }
  if (!r.success) {
    if (r.code === 401 || r.error === 'NO_AUTORIZADO') {
      authFailed = true
      notify()
    }
    throw new Error(r.error || 'Error al leer datos')
  }
  if (offline || authFailed) {
    offline = false
    authFailed = false
    notify()
    if (queue.length) void flushQueue()
  }
  return r.data
}

const rows = (d: unknown) => (Array.isArray(d) ? (d as Record<string, unknown>[]) : [])

export async function fetchNotes(): Promise<Note[]> {
  if (!isRemoteEnabled()) return []
  return rows(await get('getNotes')).map(fromSheet).filter(n => n.id)
}

export async function fetchPeople(): Promise<Person[]> {
  if (!isRemoteEnabled()) return []
  return rows(await get('getPeople')).map(fromSheetPerson)
}

export async function fetchActivity(noteId?: string): Promise<ActivityEntry[]> {
  if (!isRemoteEnabled()) return []
  return rows(await get('getActivity', noteId ? { noteId } : {})).map(fromSheetActivity)
}

export async function fetchChecklist(noteId: string): Promise<ChecklistItem[]> {
  if (!isRemoteEnabled()) return []
  return rows(await get('getChecklist', { noteId })).map(fromSheetChecklist)
}

export async function fetchPlanner(): Promise<PlannerData | null> {
  if (!isRemoteEnabled()) return null
  const d = (await get('getPlanner')) as Record<string, unknown> | null
  if (!d) return null
  return {
    activities: rows(d.activities).map(activityFromSheet).filter(a => a.id),
    executions: rows(d.executions).map(executionFromSheet).filter(e => e.id),
    events: rows(d.events).map(eventFromSheet).filter(e => e.id)
  }
}

/** Para pruebas: reinicia el estado interno del módulo. */
export function __resetForTests() {
  queue = loadList(LS_QUEUE)
  failed = loadList(LS_FAILED)
  flushing = false
  offline = false
  authFailed = false
  lastError = ''
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
}
