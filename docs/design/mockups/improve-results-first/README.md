# Improve results-first (#5104)

Source: `src/mockups/ImproveResultsFirst.stories.tsx` (`mockups-improveresultsfirst--*`). Sample data. Every story has a `-phone` twin (390). Run `npm run storybook`, or `npm run ui:shot -- mockups-improveresultsfirst--<story>`.

Stories: Q1 `q-1-summary` / `q-1-disclosure`; Q2 `q-2-relevant`, `q-2-relevant-open`, `q-2-all-grouped`, `q-2-all-grouped-open`; Q3 `q-3-top` / `q-3-in-summary`; Q4 `q-4-header` / `q-4-slot` / `q-4-both`.

## Mobbin evidence per pick

| Decision | Verdict | Screens |
|---|---|---|
| Q1 one-line summary + Edit | Weak. Only Pinterest has a summary-with-pencil ("Campaign metrics (5) ✎"). The common pattern is controls that stay visible (Drive, Dropbox chips) or overflow into "More filters" / "All filters" (Workable, Walmart) = closer to the disclosure variant | [Pinterest](https://mobbin.com/screens/eec0eb2b-33e8-43db-914e-15370ec3ba02), [Workable](https://mobbin.com/screens/3f7ea552-a3d2-4733-bfb2-d4aab1c4ece9), [Walmart](https://mobbin.com/screens/8df6d24a-9cda-46d8-a0bc-1a682ceeb583), [Drive](https://mobbin.com/screens/493673b3-1c19-42c0-8dfb-759a2068b208), [Dropbox](https://mobbin.com/screens/abab9fac-1be5-4382-9893-4f7600379bf5) |
| Q2 inline disabled reasons | Supported: reason in the row, not a tooltip | [Selfridges](https://mobbin.com/screens/ef87bc06-3453-48dd-81f8-6ef9e9f1f573), [Tailscale](https://mobbin.com/screens/8ce323f4-f5c0-43c2-bd0a-dc401efce533), [Airbnb](https://mobbin.com/screens/6f838cc6-a6ac-41c4-a4ff-8747b36f1a25) |
| Q2 role goals + "More goals" | Indirectly supported (Workable "More filters", Walmart "View more"); nothing found for grouped-all | same as Q1 |
| Q3 now → potential at top | Supported: score and gain at the top of the page | [Google Ads](https://mobbin.com/screens/d9531eb3-ef5f-403d-af27-b2265e78f457), [Hootsuite](https://mobbin.com/screens/f703018d-c080-4aca-acdc-b555ed2e5f97) |
| Q4 column-header entry | Supported as a column-header menu, not a text action (a ⋮ menu per header) | [Amplitude](https://mobbin.com/screens/a08a89c8-b22d-41d6-9ed8-cea472e10ca3), [Zapier](https://mobbin.com/screens/3cc85081-48d9-47f4-b4c8-e37d8108bc97), [Notion](https://mobbin.com/screens/83e2d66a-d836-406f-b72d-d5bc20e1d16f), [Attio](https://mobbin.com/screens/3c2d207c-037e-495b-b6c8-50fe3045ed0c) |
| Q4 empty-slot menu | Not found in search | none |
