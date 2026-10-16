import { describe, expect, it } from 'vitest'
import { parseImportDraft, buildActivitiesFromParsed } from '../importCatalog'
import type { Activity } from '../../types'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Corrección de Reglas de Negocio en Importación Masiva (importCatalog)', () => {
  const jsonPath = join(process.cwd(), 'catalogo_autosol_actividades_borrador.json')
  const jsonContent = readFileSync(jsonPath, 'utf-8')
  const items = parseImportDraft(jsonContent, '2026-10-16')

  it('0. Prepara actividades y no duplica existentes con buildActivitiesFromParsed', () => {
    const existing: Activity[] = []
    const { toInsert } = buildActivitiesFromParsed(items.slice(0, 5), existing, 'RAC')
    expect(toInsert).toHaveLength(5)
  })

  it('1. M03 (declaración 85% IPSOS) tiene plazo del 1 al 14 del mes siguiente', () => {
    const m03 = items.find(i => i.importId === 'M03')
    expect(m03).toBeDefined()
    expect(m03?.frequency).toBe('MENSUAL')
    expect(m03?.windowStartDay).toBe(1)
    expect(m03?.windowEndDay).toBe(14)
    expect(m03?.splitBranches).toBe(true)
  })

  it('2. S01 (categorizar reclamos) programada los lunes', () => {
    const s01 = items.find(i => i.importId === 'S01')
    expect(s01).toBeDefined()
    expect(s01?.frequency).toBe('SEMANAL')
    // Con fecha base '2026-10-16' (viernes), el próximo lunes es '2026-10-19'
    expect(s01?.startDate).toBe('2026-10-19')
    expect(s01?.splitBranches).toBe(true)
    expect(s01?.state).toBe('ACTIVA')
  })

  it('3. S04 y S05 (coordinación semanal y preparación viaje) programadas los lunes', () => {
    const s04 = items.find(i => i.importId === 'S04')
    const s05 = items.find(i => i.importId === 'S05')
    expect(s04?.startDate).toBe('2026-10-19')
    expect(s05?.startDate).toBe('2026-10-19')
    expect(s04?.responsible).toBe('RAC')
    expect(s05?.responsible).toBe('RAC')
  })

  it('4. S06 y S07 (viaje y recorrida Salta) programadas los martes', () => {
    const s06 = items.find(i => i.importId === 'S06')
    const s07 = items.find(i => i.importId === 'S07')
    // Con fecha base '2026-10-16' (viernes), el próximo martes es '2026-10-20'
    expect(s06?.startDate).toBe('2026-10-20')
    expect(s07?.startDate).toBe('2026-10-20')
    expect(s06?.branch).toBe('SALTA')
    expect(s07?.branch).toBe('SALTA')
  })

  it('5. S09 (devoluciones recorridas taller) programada los viernes', () => {
    const s09 = items.find(i => i.importId === 'S09')
    expect(s09?.startDate).toBe('2026-10-16') // El mismo viernes base
    expect(s09?.splitBranches).toBe(true)
  })

  it('6. M12 (auditoría preventiva Posventa) bimestral (intervalo 2) e independiente por sucursal', () => {
    const m12 = items.find(i => i.importId === 'M12')
    expect(m12).toBeDefined()
    expect(m12?.frequency).toBe('MENSUAL')
    expect(m12?.interval).toBe(2)
    expect(m12?.branch).toBe('AMBAS')
    expect(m12?.splitBranches).toBe(true)
    expect(m12?.state).toBe('ACTIVA')
  })

  it('7. E08-E11 (SSI y CSI) utilizan eventos diferenciados de avance y cierre', () => {
    const e08 = items.find(i => i.importId === 'E08')
    const e09 = items.find(i => i.importId === 'E09')
    const e10 = items.find(i => i.importId === 'E10')
    const e11 = items.find(i => i.importId === 'E11')
    expect(e08?.eventType).toBe('AVANCE_SSI')
    expect(e09?.eventType).toBe('CIERRE_SSI')
    expect(e10?.eventType).toBe('AVANCE_CSI')
    expect(e11?.eventType).toBe('CIERRE_CSI')
  })

  it('8. E05 y E07 dependen de eventos de recepción de resultados (no de desplazamiento fijo de auditoría)', () => {
    const e05 = items.find(i => i.importId === 'E05')
    const e07 = items.find(i => i.importId === 'E07')
    expect(e05?.eventType).toBe('RESULTADOS_PCGC')
    expect(e07?.eventType).toBe('RESULTADOS_ISO')
    expect(e05?.offsetDays).toBe(0)
    expect(e07?.offsetDays).toBe(0)
  })

  it('9. E13, E14 y E15 no dependen de eventos inexistentes y se configuran como únicas/a demanda', () => {
    const e13 = items.find(i => i.importId === 'E13')
    const e14 = items.find(i => i.importId === 'E14')
    const e15 = items.find(i => i.importId === 'E15')
    expect(e13?.frequency).toBe('UNICA')
    expect(e14?.frequency).toBe('UNICA')
    expect(e15?.frequency).toBe('UNICA')
    expect(e13?.state).toBe('PAUSADA')
    expect(e14?.state).toBe('PAUSADA')
    expect(e15?.state).toBe('PAUSADA')
  })

  it('10. Actividades sin fecha/disparador confirmado quedan en estado PAUSADA para no saturar Hoy', () => {
    const pendingItems = items.filter(i => i.hasPendingDetails)
    expect(pendingItems.length).toBeGreaterThan(0)
    expect(pendingItems.every(i => i.state === 'PAUSADA')).toBe(true)
  })

  it('11. El importador respeta campos explícitos del JSON sin inventar reglas por código', () => {
    const customJson = JSON.stringify([
      {
        codigo: 'CUSTOM_01',
        nombre: 'Mi tarea especial',
        frecuencia: 'MENSUAL',
        intervalo: 3,
        ventana_inicio: 10,
        ventana_fin: 18,
        sucursal: 'SALTA',
        responsable: 'RAC'
      }
    ])
    const [res] = parseImportDraft(customJson, '2026-10-16')
    expect(res.frequency).toBe('MENSUAL')
    expect(res.interval).toBe(3)
    expect(res.windowStartDay).toBe(10)
    expect(res.windowEndDay).toBe(18)
    expect(res.branch).toBe('SALTA')
    expect(res.responsible).toBe('RAC')
    expect(res.state).toBe('ACTIVA')
  })
})
