# Scope decisions — Assets Category filter uses the market tree, filters the tree too (issue #5601)

_Recorded 2026-10-30 · issue #5601._

- **An Asset Category is a top-level market group, not EVE's inventory category.** Corp Assets already filters and labels by it, so one word keeps one meaning on both pages. Items with no market group fall under a last "Not on the market" heading, filterable like the rest. EVE's own categories were rejected: the slim SDE carries no names for them, and they would disagree with Corp Assets.
- **The picker is two levels, built on `MultiSelect`.** Headings are Asset Categories, rows are their direct child market groups, and ticking a heading ticks everything under it. It has search and Select all / Select none. A full-depth tree picker was rejected: a new primitive for picks search already gets close to.
- **Everything ticked is stored as "All", never as a list,** so a market group CCP adds later is included. "None" shows nothing, with a Reset filters empty state, as Mining Tax's Payee filter does.
- **The Blueprints select (Any / Originals / Copies) shows only while something under Blueprints & Reactions is ticked.**
- **Category and min value filter the station tree as well as the flat list.** A station or container with no match is hidden, and every count, value and the page total cover the matches only. Min value used to work in the flat list only; one rule for both filters now.
- **One filter row above the list in both views; on a phone, the filter sheet.** Picks ride the URL and are remembered per device, as min value is.
- **Corp Assets keeps its one-level Category filter for now;** moving it to the same picker is its own ticket.
