import { dispatchWorkflows } from './dispatch.mjs';

export default {
  async scheduled(event, env) {
    await dispatchWorkflows(event.cron, env.GITHUB_TOKEN);
  },
};
