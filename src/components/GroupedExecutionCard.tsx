import type { Activity, Execution, ExecStatus, Role } from '../types'
import { ExecutionRow } from './ExecutionRow'
import { FREQ_LABEL, COMPLETION_MODE_SHORT } from '../lib/labels'
import type { GroupedExecutionCard as GroupType } from '../lib/planner'

type Props = {
  group: GroupType
  today: string
  currentUser: Role
  compact?: boolean
  onChangeStatus: (ex: Execution, status: ExecStatus, extra?: Partial<Execution>) => void
  onChangeExecutor: (ex: Execution, executor: Role) => void
  onReschedule?: (ex: Execution, newDate: string) => void
  onSaveObservation: (ex: Execution, note: string, evidence?: string) => void
  onSelect: (ex: Execution) => void
  onEditActivity?: (act: Activity) => void
  onDuplicateActivity?: (act: Activity) => void
  onTogglePauseActivity?: (act: Activity) => void
}

export function GroupedExecutionCard({
  group,
  today,
  currentUser,
  compact = false,
  onChangeStatus,
  onChangeExecutor,
  onReschedule,
  onSaveObservation,
  onSelect,
  onEditActivity,
  onDuplicateActivity,
  onTogglePauseActivity
}: Props) {
  // Si tiene un solo ítem (por ejemplo una sola sucursal o ambas consolidadas), mostrar la fila directa
  if (group.items.length <= 1) {
    const single = group.items[0]
    if (!single) return null
    return (
      <ExecutionRow
        execution={single}
        activity={group.activity}
        today={today}
        currentUser={currentUser}
        compact={compact}
        onChangeStatus={onChangeStatus}
        onChangeExecutor={onChangeExecutor}
        onReschedule={onReschedule}
        onSaveObservation={onSaveObservation}
        onSelect={onSelect}
        onEditActivity={onEditActivity}
        onDuplicateActivity={onDuplicateActivity}
        onTogglePauseActivity={onTogglePauseActivity}
      />
    )
  }

  // Agrupamiento visual por actividad cuando ambas sucursales están en el mismo día
  const act = group.activity
  const mode = act?.completionMode || 'CUALQUIERA'

  return (
    <div className="grouped-activity-card">
      <div className="grouped-card-header">
        <span className="grouped-card-title">{group.activityName}</span>
        <div className="grouped-card-tags">
          {act?.frequency && (
            <span className="grouped-tag freq">{FREQ_LABEL[act.frequency]}</span>
          )}
          {mode !== 'CUALQUIERA' && (
            <span className="grouped-tag mode">{COMPLETION_MODE_SHORT[mode]}</span>
          )}
          {act?.category && (
            <span className="grouped-tag cat">{act.category}</span>
          )}
        </div>
      </div>

      <div className="grouped-subrows-list">
        {group.items.map(ex => (
          <ExecutionRow
            key={ex.id}
            execution={ex}
            activity={act}
            today={today}
            currentUser={currentUser}
            compact={compact}
            hideTitle={true}
            onChangeStatus={onChangeStatus}
            onChangeExecutor={onChangeExecutor}
            onReschedule={onReschedule}
            onSaveObservation={onSaveObservation}
            onSelect={onSelect}
            onEditActivity={onEditActivity}
            onDuplicateActivity={onDuplicateActivity}
            onTogglePauseActivity={onTogglePauseActivity}
          />
        ))}
      </div>
    </div>
  )
}

