# Guild events (`events/guild`)

Discord **guild-scoped** behavior (welcome, tickets, premium panels, AI channel, etc.). Loaded recursively by `handlers/loadEvents.ts` like other `events/` trees.

| Folder | Purpose |
|--------|---------|
| `config/` | Shared IDs and channel config (`serverConfig.ts`; skipped by loader basename). |
| `lifecycle/` | Member join/leave messages. |
| `community/` | Giveaways, community reactions. |
| `feedback/` | Feedback button handlers. |
| `support/` | Tickets (handler, panel sync, message logger). |
| `roles/` | Self-role panel and role pick flows. |
| `ai/` | In-guild AI channel responder. |
| `internal/` | Dev notifications, announcement translation helpers. |
| `monetization/panels/` | Premium info/perks panels (+ assets, locale JSON). |
| `monetization/jobs/` | Premium checker, role sync, account grace. |
| `monetization/commerce/` | Purchase announcements, payment log. |

**Import depth:** files directly under `guild/<area>/` use `../../../` to reach `discord/` (`structures`, `helpers`, `models`). Files under `guild/monetization/<sub>/` use `../../../../` (and `../../../../../models`).

**Not here:** Epic/Fortnite automation lives under `events/epic/`. Shop JSON/cache paths are under `src/discord/helpers/data/shop/`.
