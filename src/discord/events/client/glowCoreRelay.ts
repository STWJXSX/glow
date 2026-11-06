/**
 * Glow Core relay — feeds raw gateway events to the local core service (see api/glowCore.ts).
 *
 * - Slash / autocomplete of a remote command: the raw payload is kept for the command stub,
 *   which forwards it after the usual gates (handlers/remoteCommands.ts).
 * - Buttons, selects and modals: forwarded as they come. Only the side that owns the component
 *   (a collector or a persistent handler) answers it; the other one ignores it.
 * - Messages from users that mention the bot: forwarded (the core answers them).
 */

import { log } from '#helpers/core/logger.ts';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { forwardInteraction, forwardMessage } from '#api/glowCore.ts';
import { hasRemoteCommands, isRemoteCommandName, storeRawInteraction } from '../../handlers/remoteCommands.ts';

const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;
const AUTOCOMPLETE = 4;
const MODAL_SUBMIT = 5;

interface RawPacket {
  t?: string;
  d?: Record<string, any>;
}

const event = {
  name: 'raw',
  once: false,

  async execute(client: ExtendedClient, packet: RawPacket) {
    if (!packet?.d || !hasRemoteCommands()) return;
    const d = packet.d;

    if (packet.t === 'MESSAGE_CREATE') {
      const botId = client.user?.id;
      const mentionsBot = Array.isArray(d.mentions) && d.mentions.some((u: { id?: string }) => u?.id === botId);
      if (botId && mentionsBot && !d.author?.bot) {
        await forwardMessage({ raw: d }).catch((err) => {
          log.events.debug({ err }, '[GlowCore] Mensaje no reenviado');
        });
      }
      return;
    }

    if (packet.t !== 'INTERACTION_CREATE') return;

    if (d.type === APPLICATION_COMMAND || d.type === AUTOCOMPLETE) {
      if (typeof d.id === 'string' && isRemoteCommandName(String(d.data?.name ?? ''))) {
        storeRawInteraction(d.id, d);
      }
      return;
    }

    if (d.type === MESSAGE_COMPONENT || d.type === MODAL_SUBMIT) {
      await forwardInteraction({ raw: d, deferred: false, ephemeral: false }).catch((err) => {
        log.events.debug({ err }, '[GlowCore] Componente no reenviado');
      });
    }
  },
} as unknown as BotEvent;

export default event;
