# EveWebMail

Thread: "EveWebMail - mail client with Push / Notifications for desktop, phone & tablet - an EveApps tool" https://forums.eveonline.com/t/evewebmail-mail-client-with-push-notifications-for-desktop-phone-tablet-an-eveapps-tool/517976 (read 2026-10-07; 4 posts, all read; no user replies). evewebmail.app fetch returned only "Loading" (SPA), platform page unreadable; facts below are from posts 1-3 only.

What it is: server-backed mail PWA. Refresh tokens server-side; mail kept only in memory/cache <= 5 min, never in the database.

| Feature                                                          | Tool does                                               | Neocom Desk status                                                                                            | Evidence                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Read/send/delete mail                                            | iOS Mail look                                           | HAVE (read, send, mark read; delete not verified)                                                             | docs/features/mail.md                                |
| Multiple characters in one view, one tab per alt                 |                                                         | MISSING: Mail is active Character only                                                                        | mail.md ("two-pane client for the active Character") |
| Unified inbox + unread counts per box and total                  |                                                         | MISSING                                                                                                       | mail.md folder chips per active Character            |
| Portraits everywhere                                             |                                                         | HAVE (standing tag, portraits assumed)                                                                        | mail.md                                              |
| Log in alts on desktop, one login on phone pulls all linked alts | Server-side linking                                     | OUT OF SCOPE as built (server holds tokens); our equivalent is Firebase sync of Character list without tokens | sync-backup.md, CLAUDE.md                            |
| Browser push while open (5-min check)                            |                                                         | HAVE (Foreground Poller, 5 min)                                                                               | notifications.md                                     |
| Push while closed; Mail check every 1 min                        | Server-polled                                           | PARTIAL: closed-app push via Scheduled Push for 12 of 25 events; interval 5 min                               | README.md cross-cutting gap 9; notifications.md      |
| iOS home-screen install notice                                   | Tells Safari users to install first, push needs install | HAVE (Install Prompt)                                                                                         | app-shell.md                                         |
| Discord delivery of alerts                                       | Webhook/bot                                             | MISSING; needs a server we do not hold for tokens, but push backend exists; unverified feasibility            | notifications.md                                     |
| Notify filters, Quiet Hours, Digest                              | Per-character                                           | MISSING (notifications.md: no quiet hours, no snooze)                                                         | notifications.md "No quiet hours"                    |
| Premium gating                                                   | Extra features per character for 100M ISK donation      | n/a                                                                                                           | post 1                                               |

## Candidate gaps

1. Unified inbox across Characters (+ per-character unread badge). Headline feature of the tool; our `/mail` shows one Character. README gap 4. Feasible: headers per Character already cached in Dexie; needs multi-token fetch only for headers.
2. Quiet Hours / digest for push. Already listed as improvement idea in alerts.md/notifications.md; this tool confirms a competitor ships it. Feasible if push scheduling lives in our backend (verify in docs/features/notifications.md).
3. Discord notification channel: single tool, needs webhook storage; low priority, inferred.

## Pitfalls

- Gating features behind donations; refresh tokens on a server (we explicitly avoid).
- ESI mail polling faster than 1 min "can make ESI angry" (author): keep our >=1 min floor.

## Out of scope

Server-held login, in-memory mail cache.
