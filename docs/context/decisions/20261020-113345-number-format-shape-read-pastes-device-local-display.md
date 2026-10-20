# Scope decisions — Number format: shape-read pastes, device-local display setting

_Recorded 2026-10-20._

- **Pasted numbers are read by shape, never by the display setting.** A paste carries the EVE client's format (`5.100.000,00 ISK`), which has nothing to do with the browser it lands in. EVE prints at most two decimals, so three digits after a lone mark are a thousands group; both marks together make the later one the decimal. One helper, `engine/numbers/parseLocalizedNumber`, does this for the survey scan, appraisal quantities and D-Scan distances. Rules out a "which format is your client?" prompt.
- **Typed numbers follow the display setting.** In a field the pilot types into, a lone mark before three digits (`1.234`) is a decimal or a thousands mark per the Number format, because the mask prints it back that way. `unmaskNumber` and `parseIskAmount` pass the active mark as the tiebreak.
- **Number format is a device-local setting, default `auto`.** `auto` follows the browser's language (`Intl`), so most pilots never open it; `period` and `comma` override it. It is not synced: it describes the browser in front of the pilot, like the time format.
- **Formatters follow it through `lib/numberLocale`.** `createNumberFormat` replaces module-level `new Intl.NumberFormat('en', ...)`; changing the setting remounts the route tree once. Moving the rest of the bare `toLocaleString()` and `toFixed` call sites is a follow-up. Clipboard text, CSV exports and chat messages stay in fixed English format.
