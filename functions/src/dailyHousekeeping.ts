// dailyHousekeeping: the daily jobs (feed purge, stale-account purge, Community
// Request sweep) run as ONE scheduled function instead of three, so a deploy
// updates one function and Cloud Scheduler keeps one job. A task that throws
// does not stop the next one; the run fails afterwards, naming what failed, so
// the failure still shows in the logs and the scheduler's history.

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
      // Opaque, like the Alerts Grant calls: the cause could sit next to key material.
      logError('Daily housekeeping task failed', {
        task: task.name,
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  if (failed.length > 0) throw new Error(`Daily housekeeping failed: ${failed.join(', ')}`);
}
