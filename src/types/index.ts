export type Status = 'PENDIENTE' | 'HECHO' | 'ARCHIVADO'
export type View = 'board' | 'today' | 'reminders' | 'calendar' | 'done' | 'archived' | 'activity'
export type SyncStatus = 'idle' | 'saving' | 'error' | 'offline'

export type Note = {
  id: string
  text: string
  description?: string
  status: Status
  date?: string
  time?: string
  category: string
  priority: string
  assignee?: string
  color: string
  pinned: boolean
  x: number
  y: number
  width: number
  height: number
  createdAt: string
  updatedAt?: string
  completedAt?: string
  checklistCount?: number
  checklistDone?: number
}

export type ChecklistItem = {
  id: string
  noteId: string
  text: string
  done: boolean
  order: number
}

export type Person = {
  id: string
  name: string
  active: boolean
  order: number
  createdAt: string
}

export type ActivityEntry = {
  id: string
  noteId: string
  action: string
  detail: string
  before?: string
  after?: string
  actor?: string
  createdAt: string
}

export type SyncOp = {
  id: string
  action: string
  noteId?: string
  data?: unknown
  retries: number
  createdAt: string
}
