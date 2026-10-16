export type Status = 'PENDIENTE' | 'HECHO' | 'ARCHIVADO'
export type View = 'board' | 'today' | 'reminders' | 'calendar' | 'done' | 'archived' | 'activity'
export type Section = 'board' | 'agenda'
export type AgendaView = 'today' | 'week' | 'month'
export type SyncStatus = 'local' | 'idle' | 'saving' | 'pending' | 'error' | 'offline' | 'auth'

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
  opId: string
  action: string
  id?: string
  data?: unknown
  retries: number
  createdAt: string
  lastError?: string
}

// ============================================================
// PLANIFICADOR DE CALIDAD
// ============================================================

/** Rol de quien ejecuta o es responsable. Ambos trabajan sobre Jujuy y Salta. */
export type Role = 'RAC' | 'ANALISTA'
export type Branch = 'JUJUY' | 'SALTA'
export type BranchScope = Branch | 'AMBAS'

export type Frequency =
  | 'UNICA'
  | 'DIARIA'
  | 'SEMANAL'
  | 'MENSUAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL'
  | 'EVENTO'

export type ActivityState = 'ACTIVA' | 'PAUSADA' | 'INACTIVA'

/** Modalidades de cumplimiento operativo */
export type CompletionMode = 'CUALQUIERA' | 'CONJUNTA' | 'AMBOS_INDIVIDUAL'

/** Confirmación individual para modalidad AMBOS_INDIVIDUAL */
export type IndividualConfirmation = {
  status: ExecStatus
  completedAt?: string
  completedBy?: Role
  note?: string
}

/** Actividad maestra: qué hay que hacer y con qué regla se repite. */
export type Activity = {
  id: string
  name: string
  description?: string
  frequency: Frequency
  /** Cada cuántas unidades (semanas, meses…) se repite. Por defecto 1. */
  interval: number
  /** Fecha de la primera ocurrencia; define el día de la semana / del mes o vencimiento. */
  startDate: string
  endDate?: string
  /** La regla actual se aplica desde esta fecha (cambios de frecuencia no tocan el historial). */
  effectiveFrom?: string
  /** Para diarias o mensuales: respetar días hábiles (lunes a viernes). */
  businessDaysOnly: boolean
  /**
   * Si es true en una actividad semanal, aparece desde el lunes en "Flexibles de la semana"
   * y recién se muestra en Hoy al acercarse su vencimiento.
   */
  flexible?: boolean
  /**
   * Para actividades mensuales (o trimestrales/anuales) con ventana de ejecución (ej. del 7 al 10):
   * genera UNA sola ejecución en el período, activa desde windowStartDay hasta windowEndDay.
   */
  windowStartDay?: number
  windowEndDay?: number
  branch: BranchScope
  /** Si la sucursal es AMBAS: registrar Jujuy y Salta por separado. */
  splitBranches: boolean
  /** Responsable habitual. */
  responsible: Role
  category?: string
  /** Modalidad de cumplimiento: 'CUALQUIERA' (predeterminada), 'CONJUNTA', 'AMBOS_INDIVIDUAL' */
  completionMode?: CompletionMode
  /** Verbo/etiqueta personalizada para el botón: 'Revisado', 'Hecho', 'Enviado', 'Realizado' */
  completionLabel?: string
  /** Para actividades vinculadas a eventos (PCGC, cierre de indicadores…). */
  eventType?: string
  /** Días respecto del evento: negativo = antes, positivo = después. */
  offsetDays?: number
  /** Días de anticipación para mostrarla como "próxima a vencer". */
  leadDays?: number
  state: ActivityState
  /** Identificador de importación para evitar duplicados en reimportaciones (ej. 'D01', 'S06') */
  importId?: string
  /** Notas operativas o advertencias internas del catálogo */
  notes?: string
  sourceNoteId?: string
  createdBy?: string
  createdAt: string
  updatedAt?: string
}

export type ExecStatus = 'PENDIENTE' | 'EN_CURSO' | 'REALIZADA' | 'NO_REALIZADA'

/** Ejecución: una ocurrencia concreta de una actividad (por período y sucursal). */
export type Execution = {
  /** Determinístico: `${activityId}__${period}__${branch}` → evita duplicados. */
  id: string
  activityId: string
  period: string
  branch: BranchScope
  dueDate: string
  /** Inicio de la ventana de ejecución cuando la actividad tiene ventana (ej. '2026-10-07'). */
  windowStart?: string
  /** Quién la ejecuta en esta ocasión (puede diferir del responsable habitual). */
  executor: Role
  status: ExecStatus
  note?: string
  evidence?: string
  reason?: string
  completedAt?: string
  completedBy?: Role
  eventId?: string
  /** Modalidad copiada de la actividad */
  completionMode?: CompletionMode
  /** Verbo o acción para el botón */
  completionLabel?: string
  /** Para CONJUNTA: quiénes participaron realmente (e.g. ['RAC', 'ANALISTA']) */
  participants?: Role[]
  /** Para AMBOS_INDIVIDUAL: confirmación independiente de RAC y Analista */
  confirmations?: {
    RAC?: IndividualConfirmation
    ANALISTA?: IndividualConfirmation
  }
  /** Copia del nombre al momento de crearse (para historial). */
  activityName?: string
  createdAt: string
  updatedAt?: string
  /** Sólo en el cliente: ocurrencia calculada que aún no se guardó en Sheets. */
  virtual?: boolean
}

export type EventState = 'ACTIVO' | 'CANCELADO'

/** Hechos con fecha real que disparan actividades: auditorías, cierres oficiales… */
export type PlannerEvent = {
  id: string
  type: string
  title?: string
  date: string
  branch: BranchScope
  state: EventState
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt?: string
}

export type PlannerData = {
  activities: Activity[]
  executions: Execution[]
  events: PlannerEvent[]
}
