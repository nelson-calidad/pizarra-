import type { Activity, BranchScope, Frequency, Role } from '../types'
import { todayISO, weekday } from './dates'

export type RawImportItem = {
  id?: string
  codigo?: string
  nombre?: string
  name?: string
  frecuencia?: string
  frequency?: string
  sucursal?: string
  branch?: string
  responsable?: string
  responsible?: string
  categoria?: string
  category?: string
  separar_sucursales?: boolean
  splitBranches?: boolean
  dia_semana?: string | number
  dia?: number
  ventana_inicio?: number
  ventana_fin?: number
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
 * Normaliza sucursal
 */
function normalizeBranch(bStr?: string): { branch: BranchScope; splitBranches: boolean } {
  if (!bStr) return { branch: 'AMBAS', splitBranches: true }
  const b = bStr.toUpperCase().trim()
  if (b.includes('JUJUY') && !b.includes('SALTA') && !b.includes('AMBAS')) {
    return { branch: 'JUJUY', splitBranches: false }
  }
  if (b.includes('SALTA') && !b.includes('JUJUY') && !b.includes('AMBAS')) {
    return { branch: 'SALTA', splitBranches: false }
  }
  // Si dice 'AMBAS' pero no separado
  const isSeparated = b.includes('SEPARADO') || b.includes('INDEPENDIENTE') || b.includes('(SEPARADO)')
  return { branch: 'AMBAS', splitBranches: isSeparated }
}

/**
 * Obtiene el próximo día ISO para un día de la semana (1 = lunes, 2 = martes, etc.)
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

  // Si no se obtuvo de JSON, parseamos el formato de texto borrador:
  // "D01 — Revisar nuevas encuestas... — AMBAS (separado) [REVISAR: ...]"
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
    // Detectar encabezados de sección ej: "DIARIA (4)", "SEMANAL (12)"
    const headMatch = line.match(/^(DIARIA|SEMANAL|MENSUAL|TRIMESTRAL|SEMESTRAL|ANUAL|EVENTO|UNICA)\s*(\(\d+\))?$/i)
    if (headMatch) {
      currentSectionFreq = headMatch[1].toUpperCase()
      continue
    }

    // Detectar línea de actividad ej: "D01 — Revisar nuevas encuestas... — AMBAS (separado) [REVISAR: VALIDAR_FRECUENCIA]"
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
 * Adapta un ítem en crudo al modelo estandarizado con las reglas de negocio
 */
function adaptToParsedItem(raw: RawImportItem, index: number, effectiveStartDate: string): ParsedImportItem {
  const code = (raw.codigo || raw.id || `IMP-${index + 1}`).trim().toUpperCase()
  const name = (raw.nombre || raw.name || `Actividad ${code}`).trim()
  const freq = normalizeFrequency(raw.frecuencia || raw.frequency || (code.startsWith('D') ? 'DIARIA' : code.startsWith('S') ? 'SEMANAL' : code.startsWith('M') ? 'MENSUAL' : code.startsWith('E') ? 'EVENTO' : 'UNICA'))
  const branchInfo = normalizeBranch(raw.sucursal || raw.branch)

  // Asignación de rol habitual
  let responsible: Role = 'ANALISTA'
  const respStr = (raw.responsable || raw.responsible || '').toUpperCase()
  if (respStr.includes('RAC') || name.toLowerCase().includes('rac y analista') || name.toLowerCase().includes('coordinar agenda') || code === 'S04') {
    responsible = 'RAC'
  }

  // Identificación de reglas de exclusión explícitas requeridas:
  // 16. Mystery Shopper: está suspendido.
  // 17. Controles semanales de órdenes de reparación: se hacen a demanda.
  let isExcluded = false
  let exclusionReason: string | undefined

  const nameLower = name.toLowerCase()
  if (nameLower.includes('mystery') || nameLower.includes('shopper')) {
    isExcluded = true
    exclusionReason = 'Suspendido según directiva de Calidad'
  } else if ((code === 'U01' || nameLower.includes('órdenes de reparación') || nameLower.includes('ordenes de reparacion')) && freq === 'SEMANAL') {
    isExcluded = true
    exclusionReason = 'Control de órdenes se realiza exclusivamente a demanda, no semanal'
  }

  // Planes de acción: recordatorio de revisión
  let finalName = name
  if (code === 'S10' || nameLower.includes('planes de acción') || nameLower.includes('planes de accion')) {
    if (!finalName.toLowerCase().includes('sheet')) {
      // Dejamos en claro que es revisión del Sheet
    }
  }

  // Verificar si tiene detalles pendientes de confirmar
  const reviewTag = raw.revisar || raw.review
  const hasPendingDetails = !!(reviewTag || raw.pendiente_confirmar || nameLower.includes('validar') || code.startsWith('U'))
  const pendingReason = reviewTag
    ? `Detalle por confirmar: ${reviewTag}`
    : hasPendingDetails
    ? 'Pendiente de confirmación operativa'
    : undefined

  // Estado: las actividades pendientes de confirmación DEBEN quedar en borrador o pausadas (Requisito 8)
  const state: 'ACTIVA' | 'PAUSADA' = hasPendingDetails || isExcluded ? 'PAUSADA' : 'ACTIVA'

  // Reglas de días y fechas conocidas
  let startDate = effectiveStartDate
  let flexible = false
  let windowStartDay: number | undefined
  let windowEndDay: number | undefined
  let eventType: string | undefined
  let offsetDays: number | undefined

  // Caso: Viaje a Salta (S06) -> martes
  if (code === 'S06' || nameLower.includes('viajar a salta')) {
    startDate = getNextWeekdayDate(2, effectiveStartDate) // Martes
  } else if (code === 'S07' || nameLower.includes('recorrida semanal de taller salta')) {
    startDate = getNextWeekdayDate(2, effectiveStartDate) // Martes (aprovecha viaje)
  } else if (code === 'S09' || nameLower.includes('devoluciones de recorridas')) {
    startDate = getNextWeekdayDate(5, effectiveStartDate) // Viernes
  } else if (code === 'S11' || code === 'S12' || (freq === 'SEMANAL' && hasPendingDetails)) {
    // Semanales de avance/flexibles
    flexible = true
    startDate = getNextWeekdayDate(5, effectiveStartDate) // Vence viernes
  } else if (freq === 'MENSUAL') {
    // Si tiene ventana definida en borrador
    if (raw.ventana_inicio && raw.ventana_fin) {
      windowStartDay = raw.ventana_inicio
      windowEndDay = raw.ventana_fin
    } else if (code === 'M01' || nameLower.includes('patentamientos')) {
      windowStartDay = 1
      windowEndDay = 5
    } else if (code === 'M02' || nameLower.includes('informe cem')) {
      windowStartDay = 7
      windowEndDay = 10
    } else if (code === 'M03' || nameLower.includes('declaración mínima') || nameLower.includes('85 %')) {
      windowStartDay = 18
      windowEndDay = 22
    }
  } else if (freq === 'EVENTO') {
    if (code.startsWith('E01') || code.startsWith('E02') || code.startsWith('E03') || code.startsWith('E04') || code.startsWith('E05')) {
      eventType = 'PCGC'
      if (code === 'E01') offsetDays = -15
      else if (code === 'E02') offsetDays = -10
      else if (code === 'E03') offsetDays = -5
      else if (code === 'E04') offsetDays = -2
      else if (code === 'E05') offsetDays = 2
    } else if (code === 'E06' || code === 'E07') {
      eventType = 'ISO'
      if (code === 'E06') offsetDays = -10
      else if (code === 'E07') offsetDays = 3
    } else if (code === 'E08' || code === 'E09' || code === 'E10' || code === 'E11') {
      eventType = 'CIERRE_INDICADORES'
      if (code === 'E08' || code === 'E10') offsetDays = -1
      else offsetDays = 1
    } else if (code === 'E12') {
      eventType = 'INDUCCION_CALIDAD'
      offsetDays = 0
    }
  }

  // Categoría por código/tipo
  let category = 'Calidad'
  if (nameLower.includes('ambiente') || code === 'S11' || code === 'U06') category = 'Ambiente'
  else if (nameLower.includes('proceso') || code === 'S12' || code === 'U07') category = 'Procesos'
  else if (nameLower.includes('ipsos') || nameLower.includes('indicador') || nameLower.includes('cem')) category = 'Indicadores'
  else if (nameLower.includes('reclamo') || nameLower.includes('hot alert')) category = 'Reclamos'
  else if (nameLower.includes('taller') || nameLower.includes('recorrida')) category = 'Taller'
  else if (nameLower.includes('pcgc') || nameLower.includes('iso')) category = 'Auditorías'

  return {
    importId: code,
    name: finalName,
    description: raw.descripcion || raw.description || (reviewTag ? `[Detalle pendiente: ${reviewTag}]` : undefined),
    frequency: freq,
    interval: 1,
    startDate,
    branch: branchInfo.branch,
    splitBranches: branchInfo.splitBranches,
    responsible,
    category,
    businessDaysOnly: freq === 'DIARIA',
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
 * Convierte ítems parseados en actividades listas para guardar
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
    // Si ya existe por importId o nombre, no duplicar ni sobreescribir silenciosamente
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
    // Registrar en el mapa temporal para evitar duplicados internos dentro del mismo lote
    existingMap.set(item.importId.toUpperCase(), created)
    existingMap.set(item.name.trim().toLowerCase(), created)
  }

  return { toInsert, skippedCount, duplicateIds }
}

