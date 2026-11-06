import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';

export const SELF_ROLE_SELECT_ID = 'glow_self_roles';

/**
 * Configuración del servidor para los eventos de Discord
 * -------------------------------------------------------
 * Rellena todos los campos con los IDs reales de tu servidor.
 */
export const SERVER_CONFIG = {
  /**
   * URL de la imagen de banner que aparece al fondo del mensaje de bienvenida.
   * Puede ser un enlace a una imagen .png/.jpg/.gif.
   */
  WELCOME_BANNER_URL: 'https://cdn.discordapp.com/attachments/1444045171967918233/1480683552273072259/banner.png?ex=69b09184&is=69af4004&hm=c1de21a33aa52dd203762ba64af5b74200fc7e1561135af75fb7577a812d9e42&animated=true',

  /**
   * URL de la imagen de banner para compras premium.
   */
  PREMIUM_BANNER_URL: 'https://cdn.discordapp.com/attachments/1444045147401621504/1504787760786182304/e11df407-b46b-487d-b055-a2fdca35f0e5.jpg?ex=6a08424f&is=6a06f0cf&hm=1fb7a079e88d88ef8b4793e7709041c678406603b7879a5a146e02e8f8c4366c&',


  /**
   * Enlaces para los botones de bienvenida.
   */
  LINKS: {
    RULES:          'https://discord.com/channels/810129117260283915/1444045176656892057',
    TOS:            'https://tos.nephra.space/discord/glow',
    PRIVACY_POLICY: 'https://pp.nephra.space/discord/glow',
  },

  /** ID de tu servidor principal */
  GUILD_ID: '810129117260283915',

  /** Canal donde se envían los mensajes de bienvenida */
  WELCOME_CHANNEL_ID: '1444045102371569807',

  /** Canal donde se anuncian las compras de premium */
  PREMIUM_CHANNEL_ID: '1497872788445466786',


  /** Canal donde se envían los mensajes de despedida */
  FAREWELL_CHANNEL_ID: '1480690861024215251',

  /** Canal donde se publica el panel de selección de roles */
  ROLES_CHANNEL_ID: '1444045133753618602',

  /** Rol de miembro asignado en bienvenida y sync masivo */
  MEMBER_ROLE_ID: '1444044478271979692',

  /**
   * Roles que los miembros pueden seleccionar.
   * Añade o elimina entradas según necesites.
   * - id:          ID del rol de Discord
   * - label:       Nombre visible en el menú (máx 25 caracteres)
   * - description: Descripción visible bajo el label (máx 50 caracteres)
   */
  PICK_ROLES: [
    {
      id: '1516174785271300196',
      label: 'Updates',
      description: 'Bot update notifications',
    },
    {
      id: '1527617821305995284',
      label: 'Status',
      description: 'Service status alerts',
    },
    {
      id: '1527617858769780808',
      label: 'Suggestions',
      description: 'New suggestion posts',
    },
    {
      id: '1528330816617185393',
      label: 'Reports',
      description: 'Bug report updates',
    },
    {
      id: '1527618272206524507',
      label: 'GitHub',
      description: 'GitHub commit notifications',
    },
  ],

  /**
   * Imagen pequeña (thumbnail) arriba a la derecha del panel de roles.
   */
  ROLES_THUMBNAIL_URL: 'https://cdn.discordapp.com/icons/810129117260283915/7b0cdfa459818a26b2e6cddd61faca52.png?size=1024',

  /** Colores de acento para los containers (decimal RGB) */
  COLORS: {
    WELCOME: EMBED_COLORS.info,
    FAREWELL: 0x747f8d, // Gris neutro
    ROLES: EMBED_COLORS.info,
    SUCCESS: EMBED_COLORS.success,
    PREMIUM: EMBED_COLORS.info,
  },

};
