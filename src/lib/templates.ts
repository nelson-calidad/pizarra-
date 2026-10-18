import type { Activity } from '../types'

export type ActivityTemplate = Omit<Activity, 'id' | 'startDate' | 'createdAt' | 'state'> & {
  suggestedDayOfMonth?: number
}

/**
 * Plantillas opcionales sugeridas para Autosol S.R.L. (Jujuy y Salta).
 * Nunca se cargan automáticamente en producción; el usuario puede elegirlas al crear o desde el catálogo.
 */
export const SUGGESTED_TEMPLATES: ActivityTemplate[] = [
  // Indicadores y comunicaciones
  {
    name: 'Revisar indicadores CEM Ventas y Posventa',
    description: 'Seguimiento semanal de encuestas y puntajes CEM en ambas sucursales.',
    frequency: 'SEMANAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Indicadores'
  },
  {
    name: 'Actualizar seguimientos SSI y CSI',
    description: 'Actualización de planillas de satisfacción de clientes Ventas (SSI) y Posventa (CSI).',
    frequency: 'SEMANAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Indicadores'
  },
  {
    name: 'Preparar informe mensual de indicadores',
    description: 'Consolidado mensual de resultados de Calidad Jujuy y Salta.',
    frequency: 'MENSUAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Indicadores'
  },
  {
    name: 'Enviar correo a las jefaturas luego del cierre oficial',
    description: 'Se activa automáticamente al registrar la fecha real del cierre oficial de indicadores.',
    frequency: 'EVENTO',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Comunicaciones',
    eventType: 'CIERRE_INDICADORES',
    offsetDays: 1
  },
  {
    name: 'Coordinar reunión de resultados con jefaturas',
    description: 'Presentación de resultados posterior al cierre oficial.',
    frequency: 'EVENTO',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Comunicaciones',
    eventType: 'CIERRE_INDICADORES',
    offsetDays: 3
  },
  // Auditorías
  {
    name: 'Preparación de PCGC',
    description: 'Revisión trimestral de requisitos del Programa de Calidad de Gestión de Concesionarios.',
    frequency: 'TRIMESTRAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Auditorías'
  },
  {
    name: 'Control de legajos antes de PCGC',
    description: 'Verificación previa calculada respecto de la fecha real confirmada de PCGC.',
    frequency: 'EVENTO',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Auditorías',
    eventType: 'PCGC',
    offsetDays: -7
  },
  {
    name: 'Control de órdenes previo a PCGC',
    description: 'Revisión de órdenes de reparación previo a la fecha real de auditoría PCGC.',
    frequency: 'EVENTO',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Auditorías',
    eventType: 'PCGC',
    offsetDays: -5
  },
  {
    name: 'Auditoría ISO 9001 anual',
    description: 'Preparación y seguimiento anual del Sistema de Gestión de Calidad ISO 9001.',
    frequency: 'ANUAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Auditorías'
  },
  {
    name: 'Preparación de test de taller',
    description: 'Revisión semestral de estándares y preparación para test de taller.',
    frequency: 'SEMESTRAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Auditorías'
  },
  {
    name: 'Controles internos de Ventas y Posventa',
    description: 'Verificación mensual de procesos operativos en ambas sucursales.',
    frequency: 'MENSUAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'RAC',
    category: 'Auditorías'
  },
  // Controles habituales
  {
    name: 'Control periódico de órdenes de reparación',
    description: 'Muestreo y control documental de OR en taller.',
    frequency: 'SEMANAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Controles'
  },
  {
    name: 'Revisión de legajos de clientes',
    description: 'Control de documentación completa en carpetas de ventas.',
    frequency: 'SEMANAL',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Controles'
  },
  {
    name: 'Revisión de reclamos y Hot Alerts',
    description: 'Seguimiento de gestión y cierre oportuno de reclamos y alertas calientes.',
    frequency: 'DIARIA',
    interval: 1,
    businessDaysOnly: true,
    branch: 'AMBAS',
    splitBranches: true,
    responsible: 'ANALISTA',
    category: 'Controles'
  }
]

