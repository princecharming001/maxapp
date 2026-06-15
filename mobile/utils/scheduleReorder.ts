import type { MergedScheduleTask } from './scheduleAggregation';

/** Preserve chronological time slots; reassign tasks after a drag reorder. */
export function reorderTasksPreservingTimes(
  tasks: MergedScheduleTask[],
  fromIndex: number,
  toIndex: number,
): MergedScheduleTask[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return tasks;
  if (fromIndex >= tasks.length || toIndex >= tasks.length) return tasks;

  const slots = tasks.map((t) => t.time);
  const next = [...tasks];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((task, i) => ({
    ...task,
    time: slots[i] ?? task.time,
  }));
}

export function tasksWithChangedTimes(
  before: MergedScheduleTask[],
  after: MergedScheduleTask[],
): MergedScheduleTask[] {
  const byId = new Map(before.map((t) => [t.task_id, t]));
  return after.filter((t) => {
    const prev = byId.get(t.task_id);
    return prev && prev.time !== t.time;
  });
}
