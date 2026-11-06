<div align="center">

# ✨ Glow

**The all-in-one Fortnite companion for Discord**
Battle Royale shop & locker · Save the World tools · Epic account management

[![Discord](https://img.shields.io/badge/Discord-Glow%20Haven-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/glow-haven-810129117260283915)
![TypeScript](https://img.shields.io/badge/TypeScript-5865F2?style=for-the-badge&logo=typescript&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)

### 💬 [Join the community — discord.gg/glow-haven](https://discord.gg/glow-haven-810129117260283915)

</div>

---

## 🔍 Why this code is public

Glow asks you to link your Epic Games account, so you should be able to see what it does with it.
This repository is the source of the **Glow Discord bot**, published for transparency: anyone can
read how commands work, how accounts are linked and what is requested from Epic on your behalf.

| Where to look | |
|---|---|
| 🔑 Login & account linking | `src/discord/helpers/epic/auth/` |
| 👤 Account data model | `src/models/UsuarioInfo.ts` |
| 🧭 Command gateway (permissions, premium, cooldowns) | `src/discord/events/client/interactionCreate.ts` |
| ⚙️ Slash commands | `src/discord/commands/` |
| 🌍 Translations | `src/discord/helpers/locales/translations/` |

## 🌟 What the bot does

| | |
|---|---|
| 🛒 **Battle Royale** | Item shop images, locker renders, battle pass, sprites, gifting, auto-buy setup |
| 🛡️ **Save the World** | Mission alerts, heroes, survivors, schematics, inventory, storage, collection book |
| 👤 **Epic accounts** | Login with device auth, multiple accounts, profiles, stats, friend codes |
| 🎫 **Community** | Tickets, feedback forum, giveaways, self roles, welcome messages, moderation logs |
| 🌍 **18 languages** | Every command and message is translated |

## 🔗 Glow Services

Some Glow features are **not part of this repository**. They live on Glow's own servers because
they are shared by more than the Discord bot: the **Glow web dashboard** and the **Glow Launcher**
use the same services, settings and data.

That includes the automations, the party and lobby tools, the AI assistant, the account services
and premium management. The bot connects to them through a local API on the same server, so in
this repository you will see those commands registered and forwarded, while their implementation
stays with the services.

| How the bot talks to them | |
|---|---|
| 📡 Command registry | The services publish their commands; the bot registers them next to its own |
| 🔐 Signed requests | API key + HMAC signature, timestamp and single-use nonce (`src/discord/api/glowCoreProtocol.ts`) |
| 🏠 Local only | The API listens on the server itself and is never exposed to the internet |

## 🤝 Community & support

Questions, bug reports or ideas? Everything happens on Discord:

<div align="center">

### [![Glow Haven](https://img.shields.io/badge/Join%20Glow%20Haven-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/glow-haven-810129117260283915)

**[discord.gg/glow-haven-810129117260283915](https://discord.gg/glow-haven-810129117260283915)**

</div>

<details>
<summary>🇪🇸 <b>Español</b></summary>

<br>

**Glow** es el bot de Discord todo en uno para Fortnite: tienda y taquilla de Battle Royale,
herramientas de Salvar el Mundo y gestión de cuentas de Epic, en 18 idiomas.

**¿Por qué es público?** Glow te pide vincular tu cuenta de Epic, así que tienes derecho a ver qué
hace con ella. Aquí puedes leer cómo funcionan los comandos, cómo se vinculan las cuentas y qué se
le pide a Epic en tu nombre.

Algunas funciones (automatizaciones, herramientas de party, el asistente de IA, servicios de cuenta
y premium) están en los servidores de Glow porque las comparten el **dashboard web** y el
**Glow Launcher**. El bot se conecta a ellas mediante una API local firmada en el propio servidor.


Únete a la comunidad: **[discord.gg/glow-haven-810129117260283915](https://discord.gg/glow-haven-810129117260283915)**

</details>

---

<div align="center">
<sub>Glow is not affiliated with or endorsed by Epic Games. Fortnite is a trademark of Epic Games, Inc.</sub>
</div>
