/**
 * TICKET TRANSLATIONS
 * Legacy 11-language tables + builder for all 18 bot UI languages.
 */

import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '#helpers/locales/languages.ts';
import { TICKET_TRANSLATION_EXTRAS } from './ticketTranslationExtras.ts';

export type TicketLang = SupportedLanguage;

export interface TicketTranslation {
  flag: string;
  label: string;
  panelDescription: string;
  panelButton: string;
  topics: {
    premium: string;
    bot_support: string;
    server_issues: string;
    other: string;
  };
  topicDescriptions: {
    premium: string;
    bot_support: string;
    server_issues: string;
    other: string;
  };
  selectPlaceholder: string;
  welcome: {
    title: string;
    description: string;
    topicLabel: string;
    closeButton: string;
  };
  closed: {
    dm: string;
  };
  alreadyOpen: string;
  noPermission: string;
  ticketClosed: string;
  premium: {
    selectPlan: string;
    planPlaceholder: string;
    tierName: string;
    monthSingular: string;
    monthsPlural: string;
    monthDesc: string;
    monthDiscountDesc: string;
    lifetime: string;
    lifetimeDesc: string;
    welcomeTitle: string;
    welcomeDesc: string;
    sendPayment: string;
    staffHelp: string;
    reviewNotice: string;
    paymentLinks: string;
    planLabel: string;
    tierLabel: string;
    webHint: string;
  };
}

type LegacyTicketLang = 'es' | 'es_la' | 'en' | 'fr' | 'pt' | 'pt_br' | 'it' | 'de' | 'tr' | 'ja' | 'zh';

type LegacyPremium = Partial<TicketTranslation['premium']> & {
  yearly?: string;
  yearlyDesc?: string;
  immortal?: string;
  immortalDesc?: string;
};

const LEGACY_TICKET_TRANSLATIONS: Record<LegacyTicketLang, Omit<TicketTranslation, 'premium'> & { premium: LegacyPremium }> = {
  es: {
    flag: '🇪🇸',
    label: 'Español',
    panelDescription: 'Consulta las opciones de soporte disponibles pulsando el botón. Elige el tipo de ayuda que necesitas y serás atendido en tu idioma.',
    panelButton: 'Abrir ticket',
    topics: {
      premium: '⭐ Adquirir Premium',
      bot_support: '🤖 Soporte del Bot',
      server_issues: '🛡️ Problemas del Servidor',
      other: '📝 Otros',
    },
    topicDescriptions: {
      premium: 'Consultas sobre planes premium y pagos',
      bot_support: 'Problemas o preguntas sobre el bot',
      server_issues: 'Reportar problemas del servidor',
      other: 'Cualquier otra consulta',
    },
    selectPlaceholder: 'Elige el tipo de soporte...',
    welcome: {
      title: '¡Ticket creado!',
      description: 'Bienvenid@ al sistema de soporte. ¿En qué podemos ayudarte?\nUn miembro del equipo te atenderá pronto.',
      topicLabel: 'Tópico del ticket',
      closeButton: 'Cerrar ticket (solo staff)',
    },
    closed: {
      dm: 'Tu ticket ha sido cerrado. Si necesitas más ayuda, abre uno nuevo.',
    },
    alreadyOpen: 'Ya tienes un ticket abierto.',
    noPermission: 'Solo el staff puede cerrar tickets.',
    ticketClosed: 'Este ticket ha sido cerrado.',
    premium: {
      selectPlan: 'Selecciona la duración de Glow Premium (desde el 4.º mes 50% dto. · 10+ meses = De por vida)',
      planPlaceholder: 'Elige una duración...',
      tierName: 'Premium',
      monthSingular: '1 Mes',
      monthsPlural: '{n} Meses',
      monthDesc: '{days} días · {price}€',
      monthDiscountDesc: '{days} días · {price}€ (50% dto. desde el 4.º mes)',
      lifetime: 'De por vida (Lifetime)',
      lifetimeDesc: 'Permanente · {price}€ (10+ meses pasan directo a Lifetime)',
      welcomeTitle: 'Ticket de Premium',
      welcomeDesc: 'Has seleccionado **{plan}**. Por favor, envía una captura de pantalla o foto del comprobante de pago en este canal.',
      sendPayment: 'Envía una imagen del comprobante de pago aquí abajo.',
      staffHelp: 'Si tienes algún problema o duda, etiqueta a <@&1444044446672093225> y te ayudarán.',
      reviewNotice: 'Esta conversación es revisada por el staff incluso después de cerrar el ticket. Todo queda registrado.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Plan seleccionado',
      tierLabel: 'Tier',
      webHint: 'También puedes pagar con tarjeta/PayPal en **https://glowhaven.site/premium** (mismo Discord).',
    },
  },

  es_la: {
    flag: '🌎',
    label: 'Español Latino',
    panelDescription: 'Revisa las opciones de soporte disponibles presionando el botón. Elige el tipo de ayuda que necesitas y te atenderemos en tu idioma.',
    panelButton: 'Abrir ticket',
    topics: {
      premium: '⭐ Adquirir Premium',
      bot_support: '🤖 Soporte del Bot',
      server_issues: '🛡️ Problemas del Servidor',
      other: '📝 Otros',
    },
    topicDescriptions: {
      premium: 'Consultas sobre planes premium y pagos',
      bot_support: 'Problemas o preguntas sobre el bot',
      server_issues: 'Reportar problemas del servidor',
      other: 'Cualquier otra consulta',
    },
    selectPlaceholder: 'Elige el tipo de soporte...',
    welcome: {
      title: '¡Ticket creado!',
      description: 'Bienvenid@ al sistema de soporte. ¿En qué podemos ayudarte?\nUn miembro del equipo te atenderá pronto.',
      topicLabel: 'Tópico del ticket',
      closeButton: 'Cerrar ticket (solo staff)',
    },
    closed: {
      dm: 'Tu ticket fue cerrado. Si necesitas más ayuda, abre uno nuevo.',
    },
    alreadyOpen: 'Ya tienes un ticket abierto.',
    noPermission: 'Solo el staff puede cerrar tickets.',
    ticketClosed: 'Este ticket ha sido cerrado.',
    premium: {
      selectPlan: 'Selecciona la duración de Glow Premium (desde el 4.º mes 50% dto. · 10+ meses = De por vida)',
      planPlaceholder: 'Elige una duración...',
      tierName: 'Premium',
      monthSingular: '1 Mes',
      monthsPlural: '{n} Meses',
      monthDesc: '{days} días · {price}€',
      monthDiscountDesc: '{days} días · {price}€ (50% dto. desde el 4.º mes)',
      lifetime: 'De por vida (Lifetime)',
      lifetimeDesc: 'Permanente · {price}€ (10+ meses pasan directo a Lifetime)',
      welcomeTitle: 'Ticket de Premium',
      welcomeDesc: 'Has seleccionado **{plan}**. Por favor, envía una captura de pantalla o foto del comprobante de pago en este canal.',
      sendPayment: 'Envía una imagen del comprobante de pago aquí abajo.',
      staffHelp: 'Si tienes algún problema o duda, etiqueta a <@&1444044446672093225> y te ayudarán.',
      reviewNotice: 'Esta conversación es revisada por el staff incluso después de cerrar el ticket. Todo queda registrado.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Plan seleccionado',
      tierLabel: 'Tier',
      webHint: 'También puedes pagar con tarjeta/PayPal en **https://glowhaven.site/premium** (mismo Discord).',
    },
  },

  en: {
    flag: '🇺🇸',
    label: 'English',
    panelDescription: 'Check the available support options by pressing the button. Choose the type of help you need and you will be assisted in your language.',
    panelButton: 'Open ticket',
    topics: {
      premium: '⭐ Get Premium',
      bot_support: '🤖 Bot Support',
      server_issues: '🛡️ Server Issues',
      other: '📝 Other',
    },
    topicDescriptions: {
      premium: 'Questions about premium plans and payments',
      bot_support: 'Issues or questions about the bot',
      server_issues: 'Report server problems',
      other: 'Any other inquiry',
    },
    selectPlaceholder: 'Choose the type of support...',
    welcome: {
      title: 'Ticket Created!',
      description: 'Welcome to the support system. How can we help you?\nA team member will assist you shortly.',
      topicLabel: 'Ticket Topic',
      closeButton: 'Close ticket (staff only)',
    },
    closed: {
      dm: 'Your ticket has been closed. If you need further assistance, open a new one.',
    },
    alreadyOpen: 'You already have an open ticket.',
    noPermission: 'Only staff members can close tickets.',
    ticketClosed: 'This ticket has been closed.',
    premium: {
      selectPlan: 'Select your Glow Premium duration (50% off from 4th month · 10+ months = Lifetime)',
      planPlaceholder: 'Choose a duration...',
      tierName: 'Premium',
      monthSingular: '1 Month',
      monthsPlural: '{n} Months',
      monthDesc: '{days} days · {price}€',
      monthDiscountDesc: '{days} days · {price}€ (50% off from 4th mo)',
      lifetime: 'Lifetime',
      lifetimeDesc: 'Permanent · {price}€ (10+ months switch to Lifetime)',
      welcomeTitle: 'Premium Ticket',
      welcomeDesc: 'You selected **{plan}**. Please send a screenshot or photo of your payment receipt in this channel.',
      sendPayment: 'Send an image of your payment receipt below.',
      staffHelp: 'If you have any issues or questions, tag <@&1444044446672093225> and they will help you.',
      reviewNotice: 'This conversation is reviewed by staff even after the ticket is closed. Everything is recorded.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Selected plan',
      tierLabel: 'Tier',
      webHint: 'You can also pay with card/PayPal at **https://glowhaven.site/premium** (same Discord login).',
    },
  },

  fr: {
    flag: '🇫🇷',
    label: 'Français',
    panelDescription: 'Consultez les options de support disponibles en appuyant sur le bouton. Choisissez le type d\'aide dont vous avez besoin et vous serez assisté dans votre langue.',
    panelButton: 'Ouvrir un ticket',
    topics: {
      premium: '⭐ Obtenir Premium',
      bot_support: '🤖 Support du Bot',
      server_issues: '🛡️ Problèmes du Serveur',
      other: '📝 Autre',
    },
    topicDescriptions: {
      premium: 'Questions sur les plans premium et les paiements',
      bot_support: 'Problèmes ou questions sur le bot',
      server_issues: 'Signaler des problèmes du serveur',
      other: 'Toute autre demande',
    },
    selectPlaceholder: 'Choisissez le type de support...',
    welcome: {
      title: 'Ticket créé !',
      description: 'Bienvenue dans le système de support. Comment pouvons-nous vous aider ?\nUn membre de l\'équipe vous assistera bientôt.',
      topicLabel: 'Sujet du ticket',
      closeButton: 'Fermer le ticket (staff uniquement)',
    },
    closed: {
      dm: 'Votre ticket a été fermé. Si vous avez besoin d\'aide supplémentaire, ouvrez-en un nouveau.',
    },
    alreadyOpen: 'Vous avez déjà un ticket ouvert.',
    noPermission: 'Seul le staff peut fermer les tickets.',
    ticketClosed: 'Ce ticket a été fermé.',
    premium: {
      selectPlan: 'Sélectionnez la durée de Glow Premium (-50% dès le 4e mois · 10+ mois = À vie)',
      planPlaceholder: 'Choisissez une durée...',
      tierName: 'Premium',
      monthSingular: '1 Mois',
      monthsPlural: '{n} Mois',
      monthDesc: '{days} jours · {price}€',
      monthDiscountDesc: '{days} jours · {price}€ (-50% dès le 4e mois)',
      lifetime: 'À vie (Lifetime)',
      lifetimeDesc: 'Permanent · {price}€ (10+ mois passent à vie)',
      welcomeTitle: 'Ticket Premium',
      welcomeDesc: 'Vous avez sélectionné **{plan}**. Veuillez envoyer une capture d\'écran ou une photo de votre reçu de paiement dans ce canal.',
      sendPayment: 'Envoyez une image de votre reçu de paiement ci-dessous.',
      staffHelp: 'Si vous avez un problème ou une question, mentionnez <@&1444044446672093225> et ils vous aideront.',
      reviewNotice: 'Cette conversation est examinée par le staff même après la fermeture du ticket. Tout est enregistré.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Plan sélectionné',
      tierLabel: 'Tier',
      webHint: 'Vous pouvez aussi payer par carte/PayPal sur **https://glowhaven.site/premium** (même compte Discord).',
    },
  },

  pt: {
    flag: '🇵🇹',
    label: 'Português',
    panelDescription: 'Consulte as opções de suporte disponíveis clicando no botão. Escolha o tipo de ajuda que precisa e será atendido no seu idioma.',
    panelButton: 'Abrir ticket',
    topics: {
      premium: '⭐ Adquirir Premium',
      bot_support: '🤖 Suporte do Bot',
      server_issues: '🛡️ Problemas do Servidor',
      other: '📝 Outro',
    },
    topicDescriptions: {
      premium: 'Questões sobre planos premium e pagamentos',
      bot_support: 'Problemas ou perguntas sobre o bot',
      server_issues: 'Reportar problemas do servidor',
      other: 'Qualquer outra questão',
    },
    selectPlaceholder: 'Escolha o tipo de suporte...',
    welcome: {
      title: 'Ticket criado!',
      description: 'Bem-vindo ao sistema de suporte. Como podemos ajudá-lo?\nUm membro da equipa irá atendê-lo em breve.',
      topicLabel: 'Tópico do ticket',
      closeButton: 'Fechar ticket (apenas staff)',
    },
    closed: {
      dm: 'O seu ticket foi fechado. Se precisar de mais ajuda, abra um novo.',
    },
    alreadyOpen: 'Já tem um ticket aberto.',
    noPermission: 'Apenas o staff pode fechar tickets.',
    ticketClosed: 'Este ticket foi fechado.',
    premium: {
      selectPlan: 'Selecione a duração do Glow Premium (50% desc. a partir do 4.º mês · 10+ meses = Vitalício)',
      planPlaceholder: 'Escolha uma duração...',
      tierName: 'Premium',
      monthSingular: '1 Mês',
      monthsPlural: '{n} Meses',
      monthDesc: '{days} dias · {price}€',
      monthDiscountDesc: '{days} dias · {price}€ (50% desc. desde o 4.º mês)',
      lifetime: 'Vitalício (Lifetime)',
      lifetimeDesc: 'Permanente · {price}€ (10+ meses passam a Vitalício)',
      welcomeTitle: 'Ticket Premium',
      welcomeDesc: 'Selecionou **{plan}**. Por favor, envie uma captura de ecrã ou foto do comprovativo de pagamento neste canal.',
      sendPayment: 'Envie uma imagem do comprovativo de pagamento abaixo.',
      staffHelp: 'Se tiver algum problema ou dúvida, mencione <@&1444044446672093225> e eles irão ajudá-lo.',
      reviewNotice: 'Esta conversa é revista pelo staff mesmo após o encerramento do ticket. Tudo fica registado.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Plano selecionado',
      tierLabel: 'Tier',
      webHint: 'Também pode pagar com cartão/PayPal em **https://glowhaven.site/premium** (mesmo Discord).',
    },
  },

  pt_br: {
    flag: '🇧🇷',
    label: 'Português Brasil',
    panelDescription: 'Confira as opções de suporte disponíveis clicando no botão. Escolha o tipo de ajuda que precisa e você será atendido no seu idioma.',
    panelButton: 'Abrir ticket',
    topics: {
      premium: '⭐ Adquirir Premium',
      bot_support: '🤖 Suporte do Bot',
      server_issues: '🛡️ Problemas do Servidor',
      other: '📝 Outro',
    },
    topicDescriptions: {
      premium: 'Dúvidas sobre planos premium e pagamentos',
      bot_support: 'Problemas ou dúvidas sobre o bot',
      server_issues: 'Reportar problemas do servidor',
      other: 'Qualquer outra dúvida',
    },
    selectPlaceholder: 'Escolha o tipo de suporte...',
    welcome: {
      title: 'Ticket criado!',
      description: 'Bem-vindo ao sistema de suporte. Como podemos te ajudar?\nUm membro da equipe vai te atender em breve.',
      topicLabel: 'Tópico do ticket',
      closeButton: 'Fechar ticket (apenas staff)',
    },
    closed: {
      dm: 'Seu ticket foi fechado. Se precisar de mais ajuda, abra um novo.',
    },
    alreadyOpen: 'Você já tem um ticket aberto.',
    noPermission: 'Apenas o staff pode fechar tickets.',
    ticketClosed: 'Este ticket foi fechado.',
    premium: {
      selectPlan: 'Selecione a duração do Glow Premium (50% off a partir do 4º mês · 10+ meses = Vitalício)',
      planPlaceholder: 'Escolha uma duração...',
      tierName: 'Premium',
      monthSingular: '1 Mês',
      monthsPlural: '{n} Meses',
      monthDesc: '{days} dias · {price}€',
      monthDiscountDesc: '{days} dias · {price}€ (50% off desde o 4º mês)',
      lifetime: 'Vitalício (Lifetime)',
      lifetimeDesc: 'Permanente · {price}€ (10+ meses viram Vitalício)',
      welcomeTitle: 'Ticket Premium',
      welcomeDesc: 'Você selecionou **{plan}**. Por favor, envie uma captura de tela ou foto do comprovante de pagamento neste canal.',
      sendPayment: 'Envie uma imagem do comprovante de pagamento abaixo.',
      staffHelp: 'Se tiver algum problema ou dúvida, mencione <@&1444044446672093225> e eles vão te ajudar.',
      reviewNotice: 'Esta conversa é revisada pelo staff mesmo após o fechamento do ticket. Tudo fica registrado.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Plano selecionado',
      tierLabel: 'Tier',
      webHint: 'Você também pode pagar com cartão/PayPal em **https://glowhaven.site/premium** (mesmo Discord).',
    },
  },

  it: {
    flag: '🇮🇹',
    label: 'Italiano',
    panelDescription: 'Controlla le opzioni di supporto disponibili premendo il pulsante. Scegli il tipo di aiuto di cui hai bisogno e verrai assistito nella tua lingua.',
    panelButton: 'Apri ticket',
    topics: {
      premium: '⭐ Acquista Premium',
      bot_support: '🤖 Supporto Bot',
      server_issues: '🛡️ Problemi del Server',
      other: '📝 Altro',
    },
    topicDescriptions: {
      premium: 'Domande sui piani premium e pagamenti',
      bot_support: 'Problemi o domande sul bot',
      server_issues: 'Segnalare problemi del server',
      other: 'Qualsiasi altra richiesta',
    },
    selectPlaceholder: 'Scegli il tipo di supporto...',
    welcome: {
      title: 'Ticket creato!',
      description: 'Benvenuto nel sistema di supporto. Come possiamo aiutarti?\nUn membro del team ti assisterà a breve.',
      topicLabel: 'Argomento del ticket',
      closeButton: 'Chiudi ticket (solo staff)',
    },
    closed: {
      dm: 'Il tuo ticket è stato chiuso. Se hai bisogno di ulteriore aiuto, aprine uno nuovo.',
    },
    alreadyOpen: 'Hai già un ticket aperto.',
    noPermission: 'Solo lo staff può chiudere i ticket.',
    ticketClosed: 'Questo ticket è stato chiuso.',
    premium: {
      selectPlan: 'Seleziona la durata di Glow Premium (50% di sconto dal 4° mese · 10+ mesi = A vita)',
      planPlaceholder: 'Scegli una durata...',
      tierName: 'Premium',
      monthSingular: '1 Mese',
      monthsPlural: '{n} Mesi',
      monthDesc: '{days} giorni · {price}€',
      monthDiscountDesc: '{days} giorni · {price}€ (50% sconto dal 4° mese)',
      lifetime: 'A vita (Lifetime)',
      lifetimeDesc: 'Permanente · {price}€ (10+ mesi passano a Lifetime)',
      welcomeTitle: 'Ticket Premium',
      welcomeDesc: 'Hai selezionato **{plan}**. Per favore, invia uno screenshot o una foto della ricevuta di pagamento in questo canale.',
      sendPayment: 'Invia un\'immagine della ricevuta di pagamento qui sotto.',
      staffHelp: 'Se hai problemi o domande, menziona <@&1444044446672093225> e ti aiuteranno.',
      reviewNotice: 'Questa conversazione viene esaminata dallo staff anche dopo la chiusura del ticket. Tutto viene registrato.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Piano selezionato',
      tierLabel: 'Tier',
      webHint: 'Puoi anche pagare con carta/PayPal su **https://glowhaven.site/premium** (stesso account Discord).',
    },
  },

  de: {
    flag: '🇩🇪',
    label: 'Deutsch',
    panelDescription: 'Überprüfe die verfügbaren Support-Optionen, indem du auf den Button klickst. Wähle die Art der Hilfe, die du benötigst, und du wirst in deiner Sprache unterstützt.',
    panelButton: 'Ticket öffnen',
    topics: {
      premium: '⭐ Premium erwerben',
      bot_support: '🤖 Bot-Support',
      server_issues: '🛡️ Server-Probleme',
      other: '📝 Sonstiges',
    },
    topicDescriptions: {
      premium: 'Fragen zu Premium-Plänen und Zahlungen',
      bot_support: 'Probleme oder Fragen zum Bot',
      server_issues: 'Server-Probleme melden',
      other: 'Jede andere Anfrage',
    },
    selectPlaceholder: 'Wähle die Art des Supports...',
    welcome: {
      title: 'Ticket erstellt!',
      description: 'Willkommen im Support-System. Wie können wir dir helfen?\nEin Teammitglied wird sich in Kürze um dich kümmern.',
      topicLabel: 'Ticket-Thema',
      closeButton: 'Ticket schließen (nur Staff)',
    },
    closed: {
      dm: 'Dein Ticket wurde geschlossen. Wenn du weitere Hilfe benötigst, öffne ein neues.',
    },
    alreadyOpen: 'Du hast bereits ein offenes Ticket.',
    noPermission: 'Nur Staff-Mitglieder können Tickets schließen.',
    ticketClosed: 'Dieses Ticket wurde geschlossen.',
    premium: {
      selectPlan: 'Wähle die Glow Premium-Laufzeit (50 % Rabatt ab dem 4. Monat · 10+ Monate = Lebenslang)',
      planPlaceholder: 'Laufzeit wählen...',
      tierName: 'Premium',
      monthSingular: '1 Monat',
      monthsPlural: '{n} Monate',
      monthDesc: '{days} Tage · {price}€',
      monthDiscountDesc: '{days} Tage · {price}€ (50% Rabatt ab 4. Monat)',
      lifetime: 'Lebenslang (Lifetime)',
      lifetimeDesc: 'Dauerhaft · {price}€ (10+ Monate werden zu Lifetime)',
      welcomeTitle: 'Premium-Ticket',
      welcomeDesc: 'Du hast **{plan}** ausgewählt. Bitte sende einen Screenshot oder ein Foto deines Zahlungsbelegs in diesem Kanal.',
      sendPayment: 'Sende ein Bild deines Zahlungsbelegs unten.',
      staffHelp: 'Bei Problemen oder Fragen, erwähne <@&1444044446672093225> und sie werden dir helfen.',
      reviewNotice: 'Diese Unterhaltung wird vom Staff überprüft, auch nach Schließung des Tickets. Alles wird aufgezeichnet.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Ausgewählter Plan',
      tierLabel: 'Tier',
      webHint: 'Du kannst auch per Karte/PayPal auf **https://glowhaven.site/premium** zahlen (gleiches Discord-Konto).',
    },
  },

  tr: {
    flag: '🇹🇷',
    label: 'Türkçe',
    panelDescription: 'Butona basarak mevcut destek seçeneklerini kontrol edin. İhtiyacınız olan yardım türünü seçin ve kendi dilinizde destek alın.',
    panelButton: 'Ticket aç',
    topics: {
      premium: '⭐ Premium Al',
      bot_support: '🤖 Bot Desteği',
      server_issues: '🛡️ Sunucu Sorunları',
      other: '📝 Diğer',
    },
    topicDescriptions: {
      premium: 'Premium planlar ve ödemeler hakkında sorular',
      bot_support: 'Bot ile ilgili sorunlar veya sorular',
      server_issues: 'Sunucu sorunlarını bildir',
      other: 'Diğer herhangi bir soru',
    },
    selectPlaceholder: 'Destek türünü seçin...',
    welcome: {
      title: 'Ticket oluşturuldu!',
      description: 'Destek sistemine hoş geldiniz. Size nasıl yardımcı olabiliriz?\nBir ekip üyesi en kısa sürede size yardımcı olacaktır.',
      topicLabel: 'Ticket Konusu',
      closeButton: 'Ticket kapat (sadece yetkili)',
    },
    closed: {
      dm: 'Ticket\'ınız kapatıldı. Daha fazla yardıma ihtiyacınız varsa yeni bir ticket açın.',
    },
    alreadyOpen: 'Zaten açık bir ticket\'ınız var.',
    noPermission: 'Sadece yetkililer ticket kapatabilir.',
    ticketClosed: 'Bu ticket kapatıldı.',
    premium: {
      selectPlan: 'Glow Premium süresini seçin (4. aydan itibaren %50 indirim · 10+ ay = Ömür Boyu)',
      planPlaceholder: 'Süre seçin...',
      tierName: 'Premium',
      monthSingular: '1 Ay',
      monthsPlural: '{n} Ay',
      monthDesc: '{days} gün · {price}€',
      monthDiscountDesc: '{days} gün · {price}€ (4. aydan itibaren %50 indirim)',
      lifetime: 'Ömür Boyu (Lifetime)',
      lifetimeDesc: 'Kalıcı · {price}€ (10+ ay doğrudan Lifetime olur)',
      welcomeTitle: 'Premium Ticket',
      welcomeDesc: '**{plan}** planını seçtiniz. Lütfen bu kanalda ödeme dekontunuzun bir ekran görüntüsünü veya fotoğrafını gönderin.',
      sendPayment: 'Aşağıya ödeme dekontunuzun bir görüntüsünü gönderin.',
      staffHelp: 'Herhangi bir sorun veya sorunuz varsa, <@&1444044446672093225> etiketleyin ve size yardımcı olacaklar.',
      reviewNotice: 'Bu konuşma, ticket kapatıldıktan sonra bile staff tarafından incelenir. Her şey kaydedilir.',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: 'Seçilen plan',
      tierLabel: 'Tier',
      webHint: '**https://glowhaven.site/premium** adresinden kart/PayPal ile de ödeyebilirsiniz (aynı Discord hesabı).',
    },
  },

  ja: {
    flag: '🇯🇵',
    label: '日本語',
    panelDescription: 'ボタンを押して利用可能なサポートオプションを確認してください。必要なヘルプの種類を選択すると、あなたの言語でサポートを受けられます。',
    panelButton: 'チケットを開く',
    topics: {
      premium: '⭐ プレミアム取得',
      bot_support: '🤖 ボットサポート',
      server_issues: '🛡️ サーバーの問題',
      other: '📝 その他',
    },
    topicDescriptions: {
      premium: 'プレミアムプランと支払いに関する質問',
      bot_support: 'ボットに関する問題や質問',
      server_issues: 'サーバーの問題を報告',
      other: 'その他のお問い合わせ',
    },
    selectPlaceholder: 'サポートの種類を選択...',
    welcome: {
      title: 'チケット作成完了！',
      description: 'サポートシステムへようこそ。どのようにお手伝いできますか？\nチームメンバーがまもなく対応いたします。',
      topicLabel: 'チケットトピック',
      closeButton: 'チケットを閉じる（スタッフのみ）',
    },
    closed: {
      dm: 'チケットが閉じられました。さらにサポートが必要な場合は、新しいチケットを開いてください。',
    },
    alreadyOpen: 'すでに開いているチケットがあります。',
    noPermission: 'スタッフのみがチケットを閉じることができます。',
    ticketClosed: 'このチケットは閉じられました。',
    premium: {
      selectPlan: 'Glow Premiumの期間を選択（4か月目以降50%オフ・10か月以上は永久版）',
      planPlaceholder: '期間を選択...',
      tierName: 'Premium',
      monthSingular: '1か月',
      monthsPlural: '{n}か月',
      monthDesc: '{days}日間 · {price}€',
      monthDiscountDesc: '{days}日間 · {price}€（4か月目以降50%オフ）',
      lifetime: '永久 (Lifetime)',
      lifetimeDesc: '無期限 · {price}€（10か月以上は自動でLifetime）',
      welcomeTitle: 'プレミアムチケット',
      welcomeDesc: '**{plan}** を選択しました。このチャンネルに支払い証明のスクリーンショットまたは写真を送信してください。',
      sendPayment: '以下に支払い証明の画像を送信してください。',
      staffHelp: '問題や質問がある場合は、<@&1444044446672093225> をメンションしてください。サポートいたします。',
      reviewNotice: 'この会話はチケットが閉じられた後もスタッフによって確認されます。すべて記録されています。',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: '選択されたプラン',
      tierLabel: 'Tier',
      webHint: '**https://glowhaven.site/premium** でもカード/PayPalでお支払いいただけます（同じDiscordアカウント）。',
    },
  },

  zh: {
    flag: '🇨🇳',
    label: '简体中文',
    panelDescription: '点击按钮查看可用的支持选项。选择您需要的帮助类型，我们将以您的语言为您提供服务。',
    panelButton: '开启工单',
    topics: {
      premium: '⭐ 获取高级版',
      bot_support: '🤖 机器人支持',
      server_issues: '🛡️ 服务器问题',
      other: '📝 其他',
    },
    topicDescriptions: {
      premium: '关于高级计划和付款的问题',
      bot_support: '关于机器人的问题或疑问',
      server_issues: '报告服务器问题',
      other: '任何其他咨询',
    },
    selectPlaceholder: '选择支持类型...',
    welcome: {
      title: '工单已创建！',
      description: '欢迎来到支持系统。我们能为您做什么？\n团队成员将很快为您提供帮助。',
      topicLabel: '工单主题',
      closeButton: '关闭工单（仅限工作人员）',
    },
    closed: {
      dm: '您的工单已关闭。如需更多帮助，请开启新工单。',
    },
    alreadyOpen: '您已有一个打开的工单。',
    noPermission: '只有工作人员可以关闭工单。',
    ticketClosed: '此工单已关闭。',
    premium: {
      selectPlan: '选择 Glow Premium 时长（第4个月起5折 · 10个月及以上自动升级为终身版）',
      planPlaceholder: '选择时长...',
      tierName: 'Premium',
      monthSingular: '1 个月',
      monthsPlural: '{n} 个月',
      monthDesc: '{days} 天 · {price}€',
      monthDiscountDesc: '{days} 天 · {price}€（第4个月起5折）',
      lifetime: '终身 (Lifetime)',
      lifetimeDesc: '永久 · {price}€（满10个月自动转为终身版）',
      welcomeTitle: '高级工单',
      welcomeDesc: '您选择了 **{plan}**。请在此频道发送付款收据的截图或照片。',
      sendPayment: '请在下方发送付款收据的图片。',
      staffHelp: '如有任何问题，请提及 <@&1444044446672093225>，他们会帮助您。',
      reviewNotice: '即使工单关闭后，此对话仍会被工作人员审核。所有内容均有记录。',
      paymentLinks: '<:paypal:1489213936833400935> Paypal https://www.paypal.me/JoseGarciaAre (@JoseGarciaAre)\n<:revolut:1504966419895422996> Revolut https://revolut.me/rosarioare',
      planLabel: '已选计划',
      tierLabel: '等级',
      webHint: '也可以在 **https://glowhaven.site/premium** 使用银行卡/PayPal 付款（同一 Discord 账号）。',
    },
  },
};

const TICKET_FLAGS: Record<SupportedLanguage, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  'es-419': '🌎',
  de: '🇩🇪',
  fr: '🇫🇷',
  it: '🇮🇹',
  'pt-BR': '🇧🇷',
  pl: '🇵🇱',
  ru: '🇷🇺',
  tr: '🇹🇷',
  ja: '🇯🇵',
  ko: '🇰🇷',
  'zh-Hans': '🇨🇳',
  'zh-Hant': '🇹🇼',
  id: '🇮🇩',
  vi: '🇻🇳',
  th: '🇹🇭',
  ar: '🇸🇦',
};

const LEGACY_TO_SUPPORTED: Partial<Record<LegacyTicketLang, SupportedLanguage>> = {
  en: 'en',
  es: 'es',
  es_la: 'es-419',
  fr: 'fr',
  pt_br: 'pt-BR',
  it: 'it',
  de: 'de',
  tr: 'tr',
  ja: 'ja',
  zh: 'zh-Hans',
};

function normalizePremium(p: LegacyPremium): TicketTranslation['premium'] {
  return {
    selectPlan: p.selectPlan ?? 'Select your Glow Premium duration (50% off from 4th month · 10+ months = Lifetime)',
    planPlaceholder: p.planPlaceholder ?? 'Choose a duration...',
    tierName: p.tierName ?? 'Premium',
    monthSingular: p.monthSingular ?? '1 Month',
    monthsPlural: p.monthsPlural ?? '{n} Months',
    monthDesc: p.monthDesc ?? '{days} days · {price}€',
    monthDiscountDesc: p.monthDiscountDesc ?? '{days} days · {price}€ (50% off from 4th mo)',
    lifetime: p.lifetime ?? p.immortal ?? 'Lifetime',
    lifetimeDesc: p.lifetimeDesc ?? p.immortalDesc ?? 'Permanent · {price}€ (10+ months switch to Lifetime)',
    welcomeTitle: p.welcomeTitle ?? 'Premium Ticket',
    welcomeDesc: p.welcomeDesc ?? 'You selected **{plan}**. Send a screenshot of your payment receipt in this channel.',
    sendPayment: p.sendPayment ?? 'Send an image of your payment receipt below.',
    staffHelp: p.staffHelp ?? 'If you need help, mention staff.',
    reviewNotice: p.reviewNotice ?? 'This conversation is reviewed by staff even after the ticket is closed.',
    paymentLinks: p.paymentLinks ?? '',
    planLabel: p.planLabel ?? 'Selected plan',
    tierLabel: p.tierLabel ?? 'Tier',
    webHint: p.webHint ?? 'You can also pay with card/PayPal at **https://glowhaven.site/premium** (same Discord login).',
  };
}

function fromLegacy(entry: (typeof LEGACY_TICKET_TRANSLATIONS)[LegacyTicketLang], lang: SupportedLanguage): TicketTranslation {
  return {
    ...entry,
    flag: TICKET_FLAGS[lang],
    label: LANGUAGE_LABELS[lang],
    premium: normalizePremium(entry.premium),
  };
}

function buildTicketTranslations(): Record<SupportedLanguage, TicketTranslation> {
  const out = {} as Record<SupportedLanguage, TicketTranslation>;
  const enLegacy = LEGACY_TICKET_TRANSLATIONS.en;

  for (const lang of SUPPORTED_LANGUAGES) {
    const legacyKey = Object.entries(LEGACY_TO_SUPPORTED).find(([, v]) => v === lang)?.[0] as LegacyTicketLang | undefined;
    const base = legacyKey ? LEGACY_TICKET_TRANSLATIONS[legacyKey] : enLegacy;
    const extra = TICKET_TRANSLATION_EXTRAS[lang];
    const merged = extra
      ? {
          ...base,
          ...extra,
          topics: { ...base.topics, ...extra.topics },
          topicDescriptions: { ...base.topicDescriptions, ...extra.topicDescriptions },
          welcome: { ...base.welcome, ...extra.welcome },
          closed: { ...base.closed, ...extra.closed },
          premium: normalizePremium({ ...base.premium, ...extra.premium }),
        }
      : fromLegacy(base, lang);
    out[lang] = {
      ...merged,
      flag: TICKET_FLAGS[lang],
      label: LANGUAGE_LABELS[lang],
    };
  }

  return out;
}

export const TICKET_TRANSLATIONS: Record<TicketLang, TicketTranslation> = buildTicketTranslations();

export const TOPIC_LABELS: Record<string, string> = {
  premium: 'Premium',
  bot_support: 'Bot Support',
  server_issues: 'Server Issues',
  other: 'Other',
};
