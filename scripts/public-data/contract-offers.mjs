// Runner entry for the public contract offers job. Needs `npm --prefix functions run build`
// first; settings come from the environment (R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY). See .github/workflows/public-data-job.yml.
import { runPublicContractOffers } from '../../functions/lib/publicDataContractOffers.js';

await runPublicContractOffers(process.env);
