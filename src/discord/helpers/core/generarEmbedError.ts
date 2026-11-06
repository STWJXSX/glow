import { EmbedBuilder, Colors, type Client, type Interaction } from 'discord.js';
import { getEmoji } from './emojis.ts';
import { getTranslations } from '../locales/index.ts';

/**
 * Generador de embeds de error estandarizados
 * Versión ligera y optimizada para TypeScript con soporte de traducciones
 */

export type ErrorType = 'noCuenta' | 'noMain' | 'api' | 'custom';

export interface ErrorOptions {
  descripcion?: string;
  apiError?: any;
  client?: Client;
  interaction?: Interaction;
}

/**
 * Genera un embed de error estándar
 * @param tipo Tipo de error predefinido
 * @param options Opciones adicionales
 * @returns EmbedBuilder configurado
 */
export async function generarEmbedError(
  tipo: ErrorType,
  { descripcion, apiError, client, interaction }: ErrorOptions = {}
): Promise<EmbedBuilder> {
  const emojierror = client ? getEmoji(client, 'error') : '❌';
  const embed = new EmbedBuilder().setColor(Colors.Red);
  
  // Obtener traducciones si hay interacción
  let trans = null;
  if (interaction) {
    trans = await getTranslations(interaction);
  }

  switch (tipo) {
    case 'noCuenta':
      embed.setDescription(
        trans?.generarEmbedError?.noCuenta?.({ emoji: emojierror }) ||
        `${emojierror} No tienes una cuenta principal registrada. Usa \`/login\` primero.`
      );
      break;

    case 'noMain':
      embed.setDescription(
        trans?.generarEmbedError?.noMain?.({ emoji: emojierror }) ||
        `${emojierror} No tienes una cuenta principal seleccionada. Usa \`/login\` primero.`
      );
      break;

    case 'api':
      {
        let errorMsg = trans?.generarEmbedError?.api?.base?.({ emoji: emojierror }) ||
          `${emojierror} Ocurrió un error al procesar tu solicitud.`;
        
        if (apiError?.response?.data?.errorMessage) {
          const messageLabel = trans?.generarEmbedError?.api?.messageLabel?.() || 'Mensaje del error';
          errorMsg += `\n\n**${messageLabel}:**\n\`\`\`js\n${apiError.response.data.errorMessage}\n\`\`\``;
          
          if (apiError.response.data.errorCode) {
            errorMsg += `\n\`${apiError.response.data.errorCode}\``;
          }
        } else if (apiError?.message) {
          errorMsg += `\n\n\`\`\`js\n${apiError.message}\n\`\`\``;
        }
        
        embed
          .setTitle(trans?.generarEmbedError?.api?.title?.() || 'Oh oh! Algo ha salido mal 😢')
          .setDescription(errorMsg);
      }
      break;

    case 'custom':
    default:
      embed.setDescription(
        `${emojierror} ${descripcion || trans?.generarEmbedError?.custom || 'Ocurrió un error inesperado.'}`
      );
      break;
  }

  return embed;
}
