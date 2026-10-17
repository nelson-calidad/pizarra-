import type { Activity, BranchScope, Frequency, Role } from '../types'
import { todayISO, weekday } from './dates'

export type RawImportItem = {
  id?: string
  codigo?: string
  nombre?: string
  name?: string
  frecuencia?: string
  frequency?: string
  intervalo?: number
  interval?: number
  sucursal?: string
  branch?: string
  responsable?: string
  responsible?: string
  categoria?: string
  category?: string
  separar_sucursales?: boolean
  splitBranches?: boolean
  dia_semana?: string | number
  diaSemana?: string | number
  dia?: number
  fecha_inicio?: string
  startDate?: string
  ventana_inicio?: number
  windowStartDay?: number
  ventana_fin?: number
  windowEndDay?: number
  tipo_evento?: string
  eventType?: string
  desfase_dias?: number
  offsetDays?: number
  revisar?: string | null
  review?: string | null
  pendiente_confirmar?: boolean
  notes?: string
  descripcion?: string
  description?: string
  solo_habiles?: boolean
  businessDaysOnly?: boolean
  flexible?: boolean
}

export type ParsedImportItem = {
  importId: string
  name: string
  description?: string
  frequency: Frequency
  interval: number
  startDate: string
  branch: BranchScope
  splitBranches: boolean
  responsible: Role
  category: string
  businessDaysOnly: boolean
  flexible?: boolean
  windowStartDay?: number
  windowEndDay?: number
  eventType?: string
  offsetDays?: number
  state: 'ACTIVA' | 'PAUSADA'
  hasPendingDetails: boolean
  pendingReason?: string
  isExcluded?: boolean
  exclusionReason?: string
  originalItem: RawImportItem
}

/**
 * Normaliza nombres o códigos de frecuencia
 */
function normalizeFrequency(freqStr?: string): Frequency {
  if (!freqStr) return 'UNICA'
  const f = freqStr.toUpperCase().trim()
  if (f.includes('DIAR')) return 'DIARIA'
  if (f.includes('SEMAN')) return 'SEMANAL'
  if (f.includes('MENS')) return 'MENSUAL'
  if (f.includes('TRIM')) return 'TRIMESTRAL'
  if (f.includes('SEMES')) return 'SEMESTRAL'
  if (f.includes('ANUAL')) return 'ANUAL'
  if (f.includes('EVENT')) return 'EVENTO'
  return 'UNICA'
}

/**
 * Normaliza sucursal y comportamiento independiente
 */
function normalizeBranch(
  bStr?: string,
  explicitSplit?: boolean
): { branch: BranchScope; splitBranches: boolean } {
  if (!bStr) return { branch: 'AMBAS', splitBranches: explicitSplit !== undefined ? explicitSplit : true }
  const b = bStr.toUpperCase().trim()
  if (b.includes('GENERAL')) {
    return { branch: 'GENERAL', splitBranches: false }
  }
  if (b.includes('JUJUY') && !b.includes('SALTA') && !b.includes('AMBAS')) {
    return { branch: 'JUJUY', splitBranches: false }
  }
  if (b.includes('SALTA') && !b.includes('JUJUY') && !b.includes('AMBAS')) {
    return { branch: 'SALTA', splitBranches: false }
  }
  if (explicitSplit !== undefined) {
    return { branch: 'AMBAS', splitBranches: explicitSplit }
  }
  // Para AMBAS, siempre por defecto cumplimientos independientes para Jujuy y Salta
  return { branch: 'AMBAS', splitBranches: true }
}

/**
 * Obtiene el próximo día ISO para un día de la semana (1 = lunes, 2 = martes, ..., 7 = domingo)
 */
function getNextWeekdayDate(targetDayNum: number, fromDate: string): string {
  const [y, m, d] = fromDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const currentDay = weekday(fromDate) // 1 = lunes ... 7 = domingo
  let diff = targetDayNum - currentDay
  if (diff < 0) diff += 7
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
}

/**
 * Convierte un nombre de día de la semana a su índice (1..7)
 */
function weekdayNameToIndex(dayName: string | number): number | null {
  if (typeof dayName === 'number') {
    return dayName >= 1 && dayName <= 7 ? dayName : null
  }
  const d = String(dayName).toLowerCase().trim()
  if (d.includes('lun')) return 1
  if (d.includes('mar')) return 2
  if (d.includes('mié') || d.includes('mie')) return 3
  if (d.includes('jue')) return 4
  if (d.includes('vie')) return 5
  if (d.includes('sáb') || d.includes('sab')) return 6
  if (d.includes('dom')) return 7
  return null
}

/**
 * Parsea el texto o JSON de borrador
 */
export function parseImportDraft(content: string, effectiveStartDate = todayISO()): ParsedImportItem[] {
  let rawItems: RawImportItem[] = []

  // Intenta parsear como JSON
  try {
    const trimmed = content.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        rawItems = parsed
      } else if (parsed && Array.isArray(parsed.actividades)) {
        rawItems = parsed.actividades
      } else if (parsed && Array.isArray(parsed.items)) {
        rawItems = parsed.items
      }
    }
  } catch {
    // Si no es JSON estándar, dejamos rawItems vacío y probamos parser de texto
  }

  // Si no se obtuvo de JSON, parseamos el formato de texto borrador
  if (rawItems.length === 0) {
    rawItems = parseTextDraft(content)
  }

  return rawItems.map((item, index) => adaptToParsedItem(item, index, effectiveStartDate))
}

/**
 * Parser de contingencia para texto de borrador del catálogo
 */
function parseTextDraft(text: string): RawImportItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const result: RawImportItem[] = []
  let currentSectionFreq: string | null = null

  for (const line of lines) {
    const headMatch = line.match(/^(DIARIA|SEMANAL|MENSUAL|TRIMESTRAL|SEMESTRAL|ANUAL|EVENTO|UNICA)\s*(\(\d+\))?$/i)
    if (headMatch) {
      currentSectionFreq = headMatch[1].toUpperCase()
      continue
    }

    const itemMatch = line.match(/^([DSMAEPU]\d{1,3})\s*[-—–]\s*(.*?)(?:\s*[-—–]\s*([A-ZÁÉÍÓÚ\s(),]+))?(?:\s*\[REVISAR:\s*([^\]]+)\])?$/i)
    if (itemMatch) {
      const code = itemMatch[1].toUpperCase()
      const title = itemMatch[2].trim()
      const branchText = itemMatch[3] ? itemMatch[3].trim() : 'AMBAS'
      const reviewText = itemMatch[4] ? itemMatch[4].trim() : null

      let freq = currentSectionFreq || 'UNICA'
      if (!currentSectionFreq) {
        if (code.startsWith('D')) freq = 'DIARIA'
        else if (code.startsWith('S')) freq = 'SEMANAL'
        else if (code.startsWith('M')) freq = 'MENSUAL'
        else if (code.startsWith('A')) freq = 'SEMESTRAL'
        else if (code.startsWith('E')) freq = 'EVENTO'
        else if (code.startsWith('U')) freq = 'UNICA'
      }

      result.push({
        codigo: code,
        nombre: title,
        frecuencia: freq,
        sucursal: branchText,
        revisar: reviewText,
        pendiente_confirmar: !!reviewText
      })
    }
  }

  return result
}

/**
 * Adapta un ítem en crudo al modelo estandarizado respetando PRIORITARIAMENTE
 * los campos explícitos del JSON/archivo (frecuencia, intervalo, sucursal, etc.)
 */
function adaptToParsedItem(raw: RawImportItem, index: number, effectiveStartDate: string): ParsedImportItem {
  const code = (raw.codigo || raw.id || `IMP-${index + 1}`).trim().toUpperCase()
  const name = (raw.nombre || raw.name || `Actividad ${code}`).trim()
  const freq = normalizeFrequency(raw.frecuencia || raw.frequency)
  const interval = raw.intervalo ?? raw.interval ?? 1
  const branchInfo = normalizeBranch(raw.sucursal || raw.branch, raw.separar_sucursales ?? raw.splitBranches)

  // Rol responsable explícito o inferido
  let responsible: Role = 'ANALISTA'
  const respStr = (raw.responsable || raw.responsible || '').toUpperCase()
  if (respStr.includes('RAC')) {
    responsible = 'RAC'
  }

  // Identificación de exclusiones requeridas
  let isExcluded = false
  let exclusionReason: string | undefined

  const nameLower = name.toLowerCase()
  if (nameLower.includes('mystery') || nameLower.includes('shopper')) {
    isExcluded = true
    exclusionReason = 'Suspendido según directiva de Calidad'
  } else if ((nameLower.includes('órdenes de reparación') || nameLower.includes('ordenes de reparacion')) && freq === 'SEMANAL') {
    isExcluded = true
    exclusionReason = 'El control de órdenes de reparación se hace a demanda, no semanal'
  }

  // Detección de si faltan datos o tiene detalles pendientes de confirmación
  const reviewTag = raw.revisar || raw.review
  let hasPendingDetails = !!(reviewTag || raw.pendiente_confirmar)
  let pendingReason = reviewTag ? `Pendiente: ${reviewTag}` : undefined

  // Ventana mensual explícita
  let windowStartDay = raw.ventana_inicio ?? raw.windowStartDay
  let windowEndDay = raw.ventana_fin ?? raw.windowEndDay

  // Evento explícito
  let eventType = raw.tipo_evento ?? raw.eventType
  let offsetDays = raw.desfase_dias ?? raw.offsetDays

  // Flexibilidad semanal explícita
  let flexible = raw.flexible ?? false

  // Cálculo de fecha de inicio (startDate)
  let startDate = raw.fecha_inicio || raw.startDate || effectiveStartDate

  if (freq === 'SEMANAL') {
    const rawDay = raw.dia_semana ?? raw.diaSemana
    if (rawDay !== undefined && rawDay !== null && rawDay !== '') {
      const dayIdx = weekdayNameToIndex(rawDay)
      if (dayIdx) {
        startDate = getNextWeekdayDate(dayIdx, effectiveStartDate)
      }
    } else if (!flexible && !hasPendingDetails) {
      // Semanal sin día especificado y no flexible -> falta confirmar día
      hasPendingDetails = true
      pendingReason = pendingReason || 'Día de la semana sin confirmar'
    }
  } else if (freq === 'MENSUAL') {
    if (!windowStartDay && !raw.dia) {
      // Mensual sin día ni ventana definida -> falta confirmar ventana/fecha
      hasPendingDetails = true
      pendingReason = pendingReason || 'Ventana mensual sin confirmar'
    }
  } else if (freq === 'EVENTO') {
    if (!eventType) {
      hasPendingDetails = true
      pendingReason = pendingReason || 'Tipo de evento disparador sin confirmar'
    }
  } else if (freq === 'UNICA') {
    // Actividades únicas o a demanda deben quedar pausadas hasta programar su fecha
    if (!raw.fecha_inicio && !raw.startDate) {
      hasPendingDetails = true
      pendingReason = pendingReason || (reviewTag ? `A demanda: ${reviewTag}` : 'Fecha de ejecución a definir')
    }
  }

  // Estado: si tiene detalles pendientes o está excluida, QUEDA PAUSADA para no generar falsos vencimientos
  const state: 'ACTIVA' | 'PAUSADA' = hasPendingDetails || isExcluded ? 'PAUSADA' : 'ACTIVA'

  // Categoría por código o texto
  let category = raw.categoria || raw.category || 'Calidad'
  if (category === 'Calidad') {
    if (nameLower.includes('ambiente')) category = 'Ambiente y Procesos'
    else if (nameLower.includes('proceso') || nameLower.includes('procedimiento')) category = 'Ambiente y Procesos'
    else if (nameLower.includes('ipsos') || nameLower.includes('indicador') || nameLower.includes('cem')) category = 'Indicadores'
    else if (nameLower.includes('reclamo') || nameLower.includes('hot alert')) category = 'Reclamos'
    else if (nameLower.includes('taller') || nameLower.includes('recorrida')) category = 'Taller'
    else if (nameLower.includes('pcgc') || nameLower.includes('iso')) category = 'Auditorías'
  }

  return {
    importId: code,
    name,
    description: raw.descripcion || raw.description || (pendingReason ? `[${pendingReason}]` : undefined),
    frequency: freq,
    interval,
    startDate,
    branch: branchInfo.branch,
    splitBranches: branchInfo.splitBranches,
    responsible,
    category,
    businessDaysOnly: raw.solo_habiles ?? raw.businessDaysOnly ?? (freq === 'DIARIA'),
    flexible,
    windowStartDay,
    windowEndDay,
    eventType,
    offsetDays,
    state,
    hasPendingDetails,
    pendingReason,
    isExcluded,
    exclusionReason,
    originalItem: raw
  }
}

/**
 * Convierte ítems parseados en actividades listas para guardar en la base de datos
 */
export function buildActivitiesFromParsed(
  items: ParsedImportItem[],
  existingActivities: Activity[],
  currentUser: Role
): { toInsert: Activity[]; skippedCount: number; duplicateIds: string[] } {
  const existingMap = new Map<string, Activity>()
  for (const act of existingActivities) {
    if (act.importId) existingMap.set(act.importId.toUpperCase(), act)
    existingMap.set(act.name.trim().toLowerCase(), act)
  }

  const toInsert: Activity[] = []
  const duplicateIds: string[] = []
  let skippedCount = 0

  const now = new Date().toISOString()

  for (const item of items) {
    const existsByCode = existingMap.has(item.importId.toUpperCase())
    const existsByName = existingMap.has(item.name.trim().toLowerCase())

    if (existsByCode || existsByName) {
      skippedCount++
      duplicateIds.push(item.importId)
      continue
    }

    const created: Activity = {
      id: crypto.randomUUID(),
      importId: item.importId,
      name: item.name,
      description: item.description,
      frequency: item.frequency,
      interval: item.interval,
      startDate: item.startDate,
      effectiveFrom: item.startDate,
      businessDaysOnly: item.businessDaysOnly,
      flexible: item.flexible,
      windowStartDay: item.windowStartDay,
      windowEndDay: item.windowEndDay,
      branch: item.branch,
      splitBranches: item.splitBranches,
      responsible: item.responsible,
      category: item.category,
      eventType: item.eventType,
      offsetDays: item.offsetDays,
      state: item.state,
      notes: item.pendingReason,
      createdBy: currentUser,
      createdAt: now,
      updatedAt: now
    }

    toInsert.push(created)
    existingMap.set(item.importId.toUpperCase(), created)
    existingMap.set(item.name.trim().toLowerCase(), created)
  }

  return { toInsert, skippedCount, duplicateIds }
}
