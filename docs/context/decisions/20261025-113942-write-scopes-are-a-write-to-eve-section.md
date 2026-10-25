# Scope decisions — Write scopes are a Write to EVE section, off by default (issue #5154)

_Recorded 2026-10-25 · issue #5154._

- **The six write scopes leave the Base Grant.** A plain login and Add Character request reads only. Write scopes on the consent screen cost trust and most people use them rarely.
- **One Permission per write feature, marked `section: 'write'` in the registry.** `mailSend`, `mailOrganize`, `calendarRespond`, `fittingsWrite`, `autopilot`, `openWindow`, all `defaultOn: false`. The read half stays in `mail` / `calendar` / `fittings`. Customize permissions, Settings and the landing page list them under a "Write to EVE" heading derived from `WRITE_GROUPS`, never hand-listed.
- **First use asks for the grant.** Each write path already reports a 403 on a missing scope through `reportWriteAuthFailure`, which offers that one Permission. Opening a mail does not write unless `organize_mail` is held; it skips silently and the Mail view shows a compact grant note instead.
- **Characters who already hold a write scope keep it.** `isPermissionGranted` checks held scopes, so the split does not make them re-grant. The Character count in Settings leaves the write section out: an opt-in not taken is not missing.
