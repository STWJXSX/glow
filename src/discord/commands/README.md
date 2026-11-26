# Slash commands layout

Two top-level trees (flat inside each bucket — no deep nesting).

## `bot/` — no Epic Games API

Discord bot, premium, dev tools, public Fortnite data (APIs, feeds, cosmetics), feedback.

Examples: `ping`, `help`, `feeds`, `premium`, `giveaway`, `cosmetic`, `map`.

## `epic/` — Epic OAuth / MCP / EOS

| Folder | What goes here |
|--------|----------------|
| **`br/`** | Battle Royale item shop, locker, sprites, buy/gift/automation tied to BR shop |
| **`stw/`** | Save the World missions, collection, loadouts, STW shop, automation |
| **`eos/`** | Epic Online Services: party, friends, taxi, ghost/spoof, presence, social, **profile**, **stats**, **playtime** |
| **`core/`** | Account-wide: login, `/account`, vbucks, gifts, autoconfig, friendcodes, … |

Loader: `handlers/loadCommands.ts` (recursive; skips `_disabled/`).

**Free bot:** with premium checks off in DB (`GlowPremiumCheckState.checksEnabled: false`) or `PREMIUM_CHECK=false`, `/premium` and `/premium-admin` are not registered. Toggle `premiumcheck` or call command reload to sync Discord.

**Import depth:** under `bot/` use `../../` → `discord/` and `../../../` → `src/models`.  
Under `epic/<bucket>/` use `../../../` → `discord/` and `../../../../` → `src/models`.
