import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activityFromSheet, activityToSheet, executionFromSheet, executionToSheet,
  eventFromSheet, eventToSheet, fromSheet, toSheet
} from '../mappers'
import {
  __resetForTests, enqueue, getSyncSnapshot, hasPending, mergeWithPending, setConnection
} from '../sheetsApi'

const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) }
})

describe('mappers', () => {
  it('ida y vuelta de actividad, ejecución, evento y nota', () => {
    const act = {
      id: 'A1', name: 'Revisar CEM', description: 'Ventas y Posventa', frequency: 'MENSUAL' as const,
      interval: 1, startDate: '2026-10-05', businessDaysOnly: false, branch: 'AMBAS' as const,
      splitBranches: true, responsible: 'RAC' as const, category: 'Indicadores', state: 'ACTIVA' as const,
      createdAt: '2026-10-01T00:00:00Z'
    }
    expect(activityFromSheet(activityToSheet(act))).toMatchObject(act)

    const ex = {
      id: 'A1__2026-10__JUJUY', activityId: 'A1', period: '2026-10', branch: 'JUJUY' as const,
      dueDate: '2026-10-05', executor: 'ANALISTA' as const, status: 'REALIZADA' as const,
      note: 'Se controlaron 15 órdenes', evidence: 'https://example.com/doc',
      completedAt: '2026-10-05T14:00:00Z', completedBy: 'ANALISTA' as const,
      createdAt: '2026-10-01T00:00:00Z'
    }
    expect(executionFromSheet(executionToSheet(ex))).toMatchObject(ex)

    const ev = {
      id: 'E1', type: 'PCGC', title: 'PCGC Q4', date: '2026-11-20',
      branch: 'AMBAS' as const, state: 'ACTIVO' as const, createdAt: '2026-10-01T00:00:00Z'
    }
    expect(eventFromSheet(eventToSheet(ev))).toMatchObject(ev)

    const note = {
      id: 'N1', text: 'Avisar a Administración', status: 'PENDIENTE' as const,
      category: 'General', priority: 'NORMAL', color: 'yellow', pinned: false,
      x: 100, y: 120, width: 264, height: 155, createdAt: '2026-10-01T00:00:00Z'
    }
    expect(fromSheet(toSheet(note))).toMatchObject(note)
  })
})

describe('cola de sincronización y merge multi-dispositivo', () => {
  beforeEach(() => {
    mem.clear()
    __resetForTests()
  })

  it('nunca muestra "idle" (Sincronizado) mientras existan cambios pendientes sin confirmar', async () => {
    // Simulamos un fetch que queda en espera o falla por desconexión
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Sin red'))))
    setConnection('https://script.google.com/macros/s/test/exec', '')

    enqueue('upsertExecution', 'EX1', { ID: 'EX1', ESTADO: 'REALIZADA' })
    expect(hasPending()).toBe(true)

    // Esperar a que termine el intento fallido
    await new Promise(r => setTimeout(r, 20))
    const snap = getSyncSnapshot()
    expect(snap.pending).toBe(1)
    expect(snap.status).not.toBe('idle')
  })

  it('conserva cambios locales pendientes cuando llegan datos desde otro dispositivo', () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Offline'))))
    setConnection('https://script.google.com/macros/s/test/exec', '')

    // Usuario A modifica EX1 localmente (aún en cola) y crea EX_LOCAL
    enqueue('upsertExecution', 'EX1', { ID: 'EX1', ESTADO: 'REALIZADA' })
    enqueue('upsertExecution', 'EX_LOCAL', { ID: 'EX_LOCAL', ESTADO: 'EN_CURSO' })

    const local = [
      { id: 'EX1', status: 'REALIZADA', note: 'Hecho local' },
      { id: 'EX2', status: 'PENDIENTE', note: '' },
      { id: 'EX_LOCAL', status: 'EN_CURSO', note: '' }
    ]
    // Servidor trae EX1 todavía PENDIENTE, pero EX2 fue actualizado por el otro usuario
    const remote = [
      { id: 'EX1', status: 'PENDIENTE', note: '' },
      { id: 'EX2', status: 'REALIZADA', note: 'Hecho por otro equipo' },
      { id: 'EX3', status: 'PENDIENTE', note: 'Nueva en servidor' }
    ]

    const merged = mergeWithPending(remote, local)
    expect(merged.find(x => x.id === 'EX1')?.status).toBe('REALIZADA')
    expect(merged.find(x => x.id === 'EX2')?.status).toBe('REALIZADA')
    expect(merged.find(x => x.id === 'EX3')?.note).toBe('Nueva en servidor')
    expect(merged.find(x => x.id === 'EX_LOCAL')?.status).toBe('EN_CURSO')
  })
})

