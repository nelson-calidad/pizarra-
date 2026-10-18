import { Users, CheckCircle2, Check, Eye, Send, ClipboardCheck, CheckSquare } from 'lucide-react'
import type { Activity, Execution, ExecStatus, Role } from '../types'
import { ExecutionRow } from './ExecutionRow'
import { describeRule, getActionType, ACTION_TYPE_LABEL } from '../lib/labels'
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
  if (!group.items || group.items.length === 0) return null

  const act = group.activity
  const mode = act?.completionMode || group.items[0]?.completionMode || 'CUALQUIERA'
  const allCompleted = group.items.length > 0 && group.items.every(ex => ex.status === 'REALIZADA')
  const actionType = getActionType(group.activityName, act?.category)

  // Descripción legible de frecuencia o regla sin categorías concatenadas
  const recurrenceSubtitle = act
    ? describeRule(act)
    : group.items[0]?.dueDate
    ? `Fecha: ${group.items[0].dueDate}`
    : ''

  const handleHeaderClick = () => {
    if (group.items[0]) {
      onSelect(group.items[0])
    }
  }

  return (
    <div className={`grouped-activity-card ${allCompleted ? 'is-card-completed' : ''}`}>
      <div className="grouped-card-header" onClick={handleHeaderClick}>
        <div className="grouped-card-header-left">
          <h3 className="grouped-card-title">
            <span
              className={`action-type-disc action-${actionType}`}
              title={`Acción: ${ACTION_TYPE_LABEL[actionType]}`}
              aria-label={ACTION_TYPE_LABEL[actionType]}
            >
              {actionType === 'revisar' && <Eye size={12} strokeWidth={2.2} />}
              {actionType === 'enviar' && <Send size={11} strokeWidth={2.2} />}
              {actionType === 'controlar' && <ClipboardCheck size={12} strokeWidth={2.2} />}
              {actionType === 'reunirse' && <Users size={12} strokeWidth={2.2} />}
              {actionType === 'otra' && <CheckSquare size={12} strokeWidth={2.2} />}
            </span>
            <span>{group.activityName}</span>
          </h3>
          <div className="grouped-card-subline">
            {recurrenceSubtitle && (
              <span className="grouped-card-freq">{recurrenceSubtitle}</span>
            )}

            {mode === 'CONJUNTA' && (
              <span className="grouped-mode-pill mode-conjunta" title="Modalidad: Trabajo conjunto (RAC + Analista)">
                <Users size={11} /> RAC + Analista
              </span>
            )}

            {mode === 'AMBOS_INDIVIDUAL' && (
              <span className="grouped-mode-pill mode-ambos" title="Modalidad: Revisión individual por separado">
                <CheckCircle2 size={11} /> Ambos individual
              </span>
            )}
          </div>
        </div>

        {allCompleted && (
          <div className="grouped-card-header-right">
            <span className="grouped-all-done-pill">
              <Check size={12} strokeWidth={2.8} />
              <span>Completada</span>
            </span>
          </div>
        )}
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
