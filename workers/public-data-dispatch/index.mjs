import { dispatchWorkflows } from './dispatch.mjs';

// Cloudflare Cron Triggers start on time; GitHub `schedule:` runs start hours
// late. This fires workflow_dispatch, which starts right away. See README.md.
export default {
  async scheduled(event, env) {
    await dispatchWorkflows(event.cron, env.GITHUB_TOKEN);
  },
};
