# EVE Crews

Thread: "EVE Crews: A lore-accurate* API-linked crew simulator" https://forums.eveonline.com/t/eve-crews-a-lore-accurate-api-linked-crew-simulator/510327 (read 2026-10-07; 190 posts, first 20 loaded via .json including the opening post; remaining ~170 not read). eve-crews.com not fetched (game). v1.69.x at post 1.

What it is: browser companion minigame/simulator. Narrative events from ESI telemetry. Not a utility tool: almost entirely OUT OF SCOPE.

| Feature                                                                                                                       | Tool does                                | Neocom Desk status                                                                                                   | Evidence                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Crew management, boarding, station ops, colonies, Twine adventure                                                             | Fiction/sim                              | OUT OF SCOPE: joke/sim                                                                                               | -                           |
| Session loop: undock, 10+ min in space, redock                                                                                | Polls location/ship to detect            | OUT OF SCOPE: needs `location`/`online` polling; no user value to us. Possible alert "docked/undocked" not requested | -                           |
| Reads: location, active ship, wallet journal, cargo, skills, saved fittings, killmails, standings, notifications, PI colonies | Read-only PKCE                           | HAVE (all those endpoints in our scopes; read-only except opt-in writes)                                             | auth-login.md, app-shell.md |
| Gamelog upload (Tactical Data Recorder)                                                                                       | Parse client gamelog for combat analysis | OUT OF SCOPE: client log file, niche                                                                                 | -                           |
| "Telemetry bars" showing when next ESI packet is available                                                                    | UI for ESI cache timers                  | PARTIAL: Poll/refresh state shown? (not verified)                                                                    | author post 16              |
| Cloud save + recovery URL                                                                                                     |                                          | HAVE (sync-backup)                                                                                                   | sync-backup.md              |

## Notes

- Replies surfaced UX complaints: low contrast text (accessibility), confusing setup; irrelevant to our features but reinforce design.md contrast rules.
- Reads "saved fittings" via ESI (we do too).

## Candidate gaps

None. A visible "next ESI refresh available" cue is the only borrowable idea; low value.
