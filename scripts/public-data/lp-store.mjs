// Runner entry for the LP store offers + cost indices public-data job. Needs
// `npm --prefix functions run build` first; settings come from the environment
// (R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). See
// .github/workflows/public-data-job.yml.
import { runPublicLpStore } from '../../functions/lib/publicDataLpStore.js';

await runPublicLpStore(process.env);
