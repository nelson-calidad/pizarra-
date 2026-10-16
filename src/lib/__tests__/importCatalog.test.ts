import { describe, expect, it } from 'vitest'
import { parseImportDraft, buildActivitiesFromParsed } from '../importCatalog'
import type { Activity } from '../../types'

const SAMPLE_DRAFT_TEXT = `
DIARIA (4)
D01 — Revisar nuevas encuestas IPSOS y actualizar indicadores Ventas/Posventa — AMBAS (separado)
D02 — Comunicar resumen de indicadores a cuatro grupos de WhatsApp — AMBAS

SEMANAL (4)
S06 — Viajar a Salta y acompañar a Ventas y Posventa — SALTA
S07 — Realizar recorrida semanal de Taller Salta — SALTA
S10 — Revisar compromisos y vencimientos de planes de acción — AMBAS
S11 — Avanzar con la organización documental de Ambiente — AMBAS [REVISAR: VALIDAR_FRECUENCIA]

MENSUAL (2)
M02 — Enviar informe CEM de Ventas y Posventa — AMBAS (separado)
M05 — Reunión de indicadores de Ventas con responsables — AMBAS (separado) [REVISAR: VALIDAR_VENTANA]

EVENTO (2)
E01 — Revisar checklist oficial PCGC con las jefaturas — AMBAS (separado) [REVISAR: VALIDAR_DESFASE]
E02 — Solicitar documentación de PCGC tras aviso oficial — AMBAS (separado)

UNICA (2)
U01 — Revisar órdenes de reparación a demanda — AMBAS (separado) [REVISAR: BAJO_DEMANDA]
U99 — Realizar auditoría Mystery Shopper de prueba — AMBAS
`

describe('Importación masiva de Catálogo (importCatalog)', () => {
  it('parsea correctamente frecuencias, códigos y sucursales separadas', () => {
    const items = parseImportDraft(SAMPLE_DRAFT_TEXT, '2026-10-16')
    expect(items.length).toBeGreaterThanOrEqual(10)

    const d01 = items.find(i => i.importId === 'D01')
    expect(d01).toBeDefined()
    expect(d01?.frequency).toBe('DIARIA')
    expect(d01?.branch).toBe('AMBAS')
    expect(d01?.splitBranches).toBe(true)

    const d02 = items.find(i => i.importId === 'D02')
    expect(d02?.splitBranches).toBe(false)
  })

  it('actividad con [REVISAR] queda en estado PAUSADA para no generar falsos vencimientos', () => {
    const items = parseImportDraft(SAMPLE_DRAFT_TEXT, '2026-10-16')
    const s11 = items.find(i => i.importId === 'S11')
    expect(s11?.hasPendingDetails).toBe(true)
    expect(s11?.state).toBe('PAUSADA')
    expect(s11?.pendingReason).toContain('VALIDAR_FRECUENCIA')
  })

  it('actividad confirmada queda en estado ACTIVA', () => {
    const items = parseImportDraft(SAMPLE_DRAFT_TEXT, '2026-10-16')
    const s06 = items.find(i => i.importId === 'S06')
    expect(s06?.hasPendingDetails).toBe(false)
    expect(s06?.state).toBe('ACTIVA')
    expect(s06?.branch).toBe('SALTA')
  })

  it('excluye Mystery Shopper explícitamente', () => {
    const items = parseImportDraft(SAMPLE_DRAFT_TEXT, '2026-10-16')
    const mystery = items.find(i => i.name.toLowerCase().includes('mystery'))
    expect(mystery?.isExcluded).toBe(true)
    expect(mystery?.exclusionReason).toContain('Suspendido')
  })

  it('detecta duplicados y evita sobreescribir actividades existentes', () => {
    const items = parseImportDraft(SAMPLE_DRAFT_TEXT, '2026-10-16')
    const existing: Activity[] = [
      {
        id: 'EXISTING_1',
        importId: 'D01',
        name: 'Revisar nuevas encuestas IPSOS y actualizar indicadores Ventas/Posventa',
        frequency: 'DIARIA',
        interval: 1,
        startDate: '2026-10-01',
        businessDaysOnly: true,
        branch: 'AMBAS',
        splitBranches: true,
        responsible: 'ANALISTA',
        state: 'ACTIVA',
        createdAt: '2026-10-01T00:00:00Z'
      }
    ]

    const { toInsert, skippedCount, duplicateIds } = buildActivitiesFromParsed(
      items,
      existing,
      'RAC'
    )

    expect(skippedCount).toBe(1)
    expect(duplicateIds).toContain('D01')
    expect(toInsert.some(a => a.importId === 'D01')).toBe(false)
  })
})

