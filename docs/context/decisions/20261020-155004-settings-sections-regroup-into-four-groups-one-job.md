# Scope decisions — Settings sections regroup into four groups, one job per section (issue #4554)

_Recorded 2026-10-20 · issue #4554._

- **Settings has four groups, each section one job.** Preferences (Display, Notifications). Defaults (Industry incl. BPC Sourcing, Planetary Industry, Market, Moon mining tax, Characters, Corporation, Travel). Account & device (Permissions, Backup = Export + Import, App = Install this app + Analytics, Log out & delete). Data (Cached data = Clear cache, Reset view preferences, Data age; Offline data; Activity log). The old "Data & storage" tab stacked nine jobs under four different names, "Alerts" was a group of one, and PI hid inside Industry. Ids: new `pi`, `backup`, `app`, `device`; `dataAge` kept (label "Cached data") so every Data age link still lands. Rules out a single-section group and a section whose label differs from its id's job.
- **Paths.** Settings › App › Install this app; Settings › Backup; Settings › Log out & delete › Delete all data; Settings › Cached data. Supersedes the Settings › Data & storage path in `20261007-190239-install-this-app-is-a-later-path-in`.
