# Public data dispatch Worker

GitHub starts `schedule:` runs hours late (#5113: lawless gaps of 150-250 min
against a 15 min target). This Worker has a Cloudflare Cron Trigger that calls
`workflow_dispatch` on `public-data-lawless-systems.yml` every 15 min and on
`public-data-contract-offers.yml` and `public-data-hauling-books.yml` every 30 min (two
crons, well inside the Cloudflare free plan's limit), which start right away. The workflow's own `schedule:` stays as a fallback; its
`concurrency` group (`cancel-in-progress: false`) keeps overlapping runs from
colliding (one running and one pending run per group; extra pending runs are dropped), and the job rewrites one R2 object, so last writer wins.

## One-time setup (Shawn)

1. GitHub: Settings > Developer settings > Fine-grained tokens. Resource owner
   `shawndibble`, repository `neocom-desk` only, permission **Actions: Read and
   write** (nothing else). Set a long expiry and note the date.
2. From this folder:

   ```
   cd workers/public-data-dispatch
   npx wrangler@4 secret put GITHUB_TOKEN
   npx wrangler@4 deploy
   ```

   The first `secret put` creates the Worker. Use the same Cloudflare account as
   the Pages project and R2 bucket.

## Check it

- Cloudflare dashboard > Workers > `neocom-desk-public-data-dispatch` > Observability (logs on via `wrangler.toml`):
  invocations every 15 min, no errors.
- Runs started by it show `workflow_dispatch` as the event:
  `gh run list --workflow public-data-lawless-systems.yml --event workflow_dispatch`
- Hauling books: `gh run list --workflow public-data-hauling-books.yml --event workflow_dispatch`;
  a run on an unchanged snapshot ends in seconds ("snapshot unchanged" in its log).
- Contract offers: `gh run list --workflow public-data-contract-offers.yml --event workflow_dispatch`;
  a run with an unchanged archive ends in seconds ("archive unchanged" in its log).
- Freshness: `curl -sI https://data.neocomdesk.com/lawless-systems/systems.json | grep -i last-modified`
  stays under an hour old.

## Change the schedule

Edit `SCHEDULES` in `dispatch.mjs` and `crons` in `wrangler.toml` together (the
key is the exact cron string), then `npx wrangler@4 deploy`. Add another
`public-data-*` workflow only if its GitHub schedule shows the same delay.

## Token expiry

A 401/403 in the Worker logs means the token expired or lost access. Make a new
one and run `npx wrangler@4 secret put GITHUB_TOKEN`.
