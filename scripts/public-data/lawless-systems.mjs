// Runner entry for the lawless-systems public-data job. Needs `npm --prefix functions run build`
// first; settings come from the environment (R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY). See .github/workflows/public-data-job.yml.
import { runPublicLawlessSystems } from '../../functions/lib/publicDataLawlessSystems.js';

await runPublicLawlessSystems(process.env);
