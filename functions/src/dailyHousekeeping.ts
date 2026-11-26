export interface HousekeepingTask {
  name: string;
  run: () => Promise<unknown>;
}

export async function runDailyHousekeeping(
  tasks: readonly HousekeepingTask[],
  logError: (message: string, data: { task: string; error: string }) => void
): Promise<void> {
  const failed: string[] = [];
  for (const task of tasks) {
    try {
      await task.run();
    } catch (err) {
      failed.push(task.name);
      logError('Daily housekeeping task failed', {
        task: task.name,
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  if (failed.length > 0) throw new Error(`Daily housekeeping failed: ${failed.join(', ')}`);
}
