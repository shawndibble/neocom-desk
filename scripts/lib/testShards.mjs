const TEST_FILE =
  /^(?:src\/.+\.(?:test|spec)\.tsx?|scripts\/lib\/.+\.test\.mjs|workers\/.+\.test\.mjs)$/;

const REPO_ROOT = /^.*?\/neocom-desk(?:\.worktrees\/[^/]+|[^/]*)\/(?=(?:src|scripts|workers)\/)/;

export const isUnitTestFile = (file) => TEST_FILE.test(file);

export function weightsFromVitestReports(reports) {
  const seconds = new Map();
  for (const report of reports) {
    for (const suite of report.testResults) {
      const file = suite.name.replace(REPO_ROOT, '');
      const list = seconds.get(file) ?? [];
      list.push((suite.endTime - suite.startTime) / 1000);
      seconds.set(file, list);
    }
  }
  return Object.fromEntries(
    [...seconds]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, list]) => [
        file,
        Math.max(1, Math.round(list.reduce((sum, value) => sum + value, 0) / list.length)),
      ])
  );
}
