// Pure helpers for the public-data dispatch Worker (index.mjs). No Worker APIs
// here, so Vitest can load it (scripts/lib/publicDataDispatch.test.mjs).

export const REPO = 'shawndibble/neocom-desk';
export const REF = 'develop';

// Cron expression -> workflow files to dispatch. Keys must match the Worker's
// `triggers.crons` in wrangler.toml exactly (event.cron echoes the string).
export const SCHEDULES = {
  '*/15 * * * *': ['public-data-lawless-systems.yml'],
};

export function workflowsForCron(cron) {
  return SCHEDULES[cron] ?? [];
}

export function buildDispatchRequest(workflow, token) {
  return {
    url: `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    init: {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'neocom-desk-public-data-dispatch',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: REF }),
    },
  };
}

// GitHub answers 204 No Content on success. Any other status throws, so the
// Worker invocation shows as failed in the Cloudflare dashboard.
export async function dispatchWorkflows(cron, token, fetchFn = fetch) {
  const workflows = workflowsForCron(cron);
  if (workflows.length === 0) throw new Error(`No workflows mapped to cron "${cron}"`);
  if (!token) throw new Error('GITHUB_TOKEN secret is not set');
  const failures = [];
  for (const workflow of workflows) {
    const { url, init } = buildDispatchRequest(workflow, token);
    const res = await fetchFn(url, init);
    if (res.status !== 204) failures.push(`${workflow}: HTTP ${res.status} ${await res.text()}`);
  }
  if (failures.length > 0) throw new Error(`Dispatch failed: ${failures.join('; ')}`);
  return workflows;
}
