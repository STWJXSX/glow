import type { SupportedLanguage } from '#helpers/locales/index.ts';

export interface LoadoutPanelUi {
  commander: string;
  heroAbilities: string;
  teamPerk: string;
  supportTeam: string;
  gadgets: string;
  level: string;
  noCommander: string;
}

const PANEL_UI: Record<SupportedLanguage, LoadoutPanelUi> = {
  en: {
    commander: 'Commander',
    heroAbilities: 'Hero Abilities',
    teamPerk: 'Team Perk',
    supportTeam: 'Support Team',
    gadgets: 'Gadgets',
    level: 'LV',
    noCommander: 'No commander',
  },
  es: {
    commander: 'Comandante',
    heroAbilities: 'Habilidades',
    teamPerk: 'Ventaja de equipo',
    supportTeam: 'Equipo de apoyo',
    gadgets: 'Artilugios',
    level: 'NV',
    noCommander: 'Sin comandante',
  },
  'es-419': {
    commander: 'Comandante',
    heroAbilities: 'Habilidades',
    teamPerk: 'Ventaja de equipo',
    supportTeam: 'Equipo de apoyo',
    gadgets: 'Artilugios',
    level: 'NV',
    noCommander: 'Sin comandante',
  },
  de: {
    commander: 'Kommandant',
    heroAbilities: 'Heldenfähigkeiten',
    teamPerk: 'Team-Vorteil',
    supportTeam: 'Unterstützungsteam',
    gadgets: 'Gadgets',
    level: 'LV',
    noCommander: 'Kein Kommandant',
  },
  fr: {
    commander: 'Commandant',
    heroAbilities: 'Capacités du héros',
    teamPerk: 'Avantage d\'équipe',
    supportTeam: 'Équipe de soutien',
    gadgets: 'Gadgets',
    level: 'NV',
    noCommander: 'Aucun commandant',
  },
  it: {
    commander: 'Comandante',
    heroAbilities: 'Abilità dell\'eroe',
    teamPerk: 'Vantaggio di squadra',
    supportTeam: 'Squadra di supporto',
    gadgets: 'Gadget',
    level: 'LV',
    noCommander: 'Nessun comandante',
  },
  'pt-BR': {
    commander: 'Comandante',
    heroAbilities: 'Habilidades do herói',
    teamPerk: 'Vantagem de equipe',
    supportTeam: 'Equipe de apoio',
    gadgets: 'Apetrechos',
    level: 'NV',
    noCommander: 'Sem comandante',
  },
  pl: {
    commander: 'Dowódca',
    heroAbilities: 'Umiejętności bohatera',
    teamPerk: 'Atut drużyny',
    supportTeam: 'Drużyna wsparcia',
    gadgets: 'Gadżety',
    level: 'POZ',
    noCommander: 'Brak dowódcy',
  },
  ru: {
    commander: 'Командир',
    heroAbilities: 'Способности героя',
    teamPerk: 'Командный бонус',
    supportTeam: 'Команда поддержки',
    gadgets: 'Гаджеты',
    level: 'УР',
    noCommander: 'Нет командира',
  },
  tr: {
    commander: 'Komutan',
    heroAbilities: 'Kahraman yetenekleri',
    teamPerk: 'Takım avantajı',
    supportTeam: 'Destek takımı',
    gadgets: 'Aletler',
    level: 'SV',
    noCommander: 'Komutan yok',
  },
  ja: {
    commander: 'コマンダー',
    heroAbilities: 'ヒーローアビリティ',
    teamPerk: 'チームパーク',
    supportTeam: 'サポートチーム',
    gadgets: 'ガジェット',
    level: 'LV',
    noCommander: 'コマンダーなし',
  },
  ko: {
    commander: '지휘관',
    heroAbilities: '영웅 능력',
    teamPerk: '팀 특전',
    supportTeam: '지원 팀',
    gadgets: '가젯',
    level: 'LV',
    noCommander: '지휘관 없음',
  },
  'zh-Hans': {
    commander: '指挥官',
    heroAbilities: '英雄技能',
    teamPerk: '团队加成',
    supportTeam: '支援团队',
    gadgets: '小工具',
    level: '等级',
    noCommander: '无指挥官',
  },
  'zh-Hant': {
    commander: '指揮官',
    heroAbilities: '英雄技能',
    teamPerk: '團隊加成',
    supportTeam: '支援團隊',
    gadgets: '小工具',
    level: '等級',
    noCommander: '無指揮官',
  },
  id: {
    commander: 'Komandan',
    heroAbilities: 'Kemampuan pahlawan',
    teamPerk: 'Keuntungan tim',
    supportTeam: 'Tim pendukung',
    gadgets: 'Gadget',
    level: 'LV',
    noCommander: 'Tanpa komandan',
  },
  vi: {
    commander: 'Chỉ huy',
    heroAbilities: 'Kỹ năng anh hùng',
    teamPerk: 'Đặc quyền đội',
    supportTeam: 'Đội hỗ trợ',
    gadgets: 'Tiện ích',
    level: 'Cấp',
    noCommander: 'Không có chỉ huy',
  },
  th: {
    commander: 'ผู้บัญชาการ',
    heroAbilities: 'ความสามารถฮีโร่',
    teamPerk: 'สิทธิพิเศษทีม',
    supportTeam: 'ทีมสนับสนุน',
    gadgets: 'แก็ดเจ็ต',
    level: 'เลเวล',
    noCommander: 'ไม่มีผู้บัญชาการ',
  },
  ar: {
    commander: 'القائد',
    heroAbilities: 'قدرات البطل',
    teamPerk: 'ميزة الفريق',
    supportTeam: 'فريق الدعم',
    gadgets: 'الأدوات',
    level: 'مستوى',
    noCommander: 'لا يوجد قائد',
  },
};

const CLASS_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: { commando: 'Soldier', ninja: 'Ninja', constructor: 'Constructor', outlander: 'Outlander' },
  es: { commando: 'Soldado', ninja: 'Ninja', constructor: 'Constructor', outlander: 'Trotamundos' },
  'es-419': { commando: 'Soldado', ninja: 'Ninja', constructor: 'Constructor', outlander: 'Trotamundos' },
  de: { commando: 'Soldat', ninja: 'Ninja', constructor: 'Konstrukteur', outlander: 'Entdecker' },
  fr: { commando: 'Soldat', ninja: 'Ninja', constructor: 'Constructeur', outlander: 'Éclaireur' },
  it: { commando: 'Soldato', ninja: 'Ninja', constructor: 'Costruttore', outlander: 'Esploratore' },
  'pt-BR': { commando: 'Soldado', ninja: 'Ninja', constructor: 'Construtor', outlander: 'Explorador' },
  pl: { commando: 'Żołnierz', ninja: 'Ninja', constructor: 'Konstruktor', outlander: 'Odkrywca' },
  ru: { commando: 'Солдат', ninja: 'Ниндзя', constructor: 'Конструктор', outlander: 'Следопыт' },
  tr: { commando: 'Asker', ninja: 'Ninja', constructor: 'Mühendis', outlander: 'Kaşif' },
  ja: { commando: 'ソルジャー', ninja: 'ニンジャ', constructor: 'コンストラクター', outlander: 'アウトランダー' },
  ko: { commando: '솔져', ninja: '닌자', constructor: '건설자', outlander: '아웃랜더' },
  'zh-Hans': { commando: '士兵', ninja: '忍者', constructor: '建造者', outlander: '漂泊者' },
  'zh-Hant': { commando: '士兵', ninja: '忍者', constructor: '建造者', outlander: '漂泊者' },
  id: { commando: 'Prajurit', ninja: 'Ninja', constructor: 'Konstruktor', outlander: 'Penjelajah' },
  vi: { commando: 'Lính', ninja: 'Ninja', constructor: 'Kỹ sư', outlander: 'Thám hiểm' },
  th: { commando: 'ทหาร', ninja: 'นินจา', constructor: 'ช่างก่อสร้าง', outlander: 'นักสำรวจ' },
  ar: { commando: 'جندي', ninja: 'نينجا', constructor: 'باني', outlander: 'مستكشف' },
};

const RARITY_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    sr: 'Legendary', ssr: 'Mythic', ur: 'Mythic', er: 'Mythic', vr: 'Epic',
    r: 'Rare', uc: 'Uncommon', c: 'Common',
  },
  es: {
    sr: 'Legendario', ssr: 'Mítico', ur: 'Mítico', er: 'Mítico', vr: 'Épico',
    r: 'Raro', uc: 'Poco común', c: 'Común',
  },
  'es-419': {
    sr: 'Legendario', ssr: 'Mítico', ur: 'Mítico', er: 'Mítico', vr: 'Épico',
    r: 'Raro', uc: 'Poco común', c: 'Común',
  },
  de: {
    sr: 'Legendär', ssr: 'Mythisch', ur: 'Mythisch', er: 'Mythisch', vr: 'Episch',
    r: 'Selten', uc: 'Ungewöhnlich', c: 'Häufig',
  },
  fr: {
    sr: 'Légendaire', ssr: 'Mythique', ur: 'Mythique', er: 'Mythique', vr: 'Épique',
    r: 'Rare', uc: 'Peu commun', c: 'Commun',
  },
  it: {
    sr: 'Leggendario', ssr: 'Mitico', ur: 'Mitico', er: 'Mitico', vr: 'Epico',
    r: 'Raro', uc: 'Non comune', c: 'Comune',
  },
  'pt-BR': {
    sr: 'Lendário', ssr: 'Mítico', ur: 'Mítico', er: 'Mítico', vr: 'Épico',
    r: 'Raro', uc: 'Incomum', c: 'Comum',
  },
  pl: {
    sr: 'Legendarny', ssr: 'Mityczny', ur: 'Mityczny', er: 'Mityczny', vr: 'Epicki',
    r: 'Rzadki', uc: 'Niepospolity', c: 'Pospolity',
  },
  ru: {
    sr: 'Легендарный', ssr: 'Мифический', ur: 'Мифический', er: 'Мифический', vr: 'Эпический',
    r: 'Редкий', uc: 'Необычный', c: 'Обычный',
  },
  tr: {
    sr: 'Efsanevi', ssr: 'Mitik', ur: 'Mitik', er: 'Mitik', vr: 'Destansı',
    r: 'Nadir', uc: 'Sıradışı', c: 'Sıradan',
  },
  ja: {
    sr: 'レジェンダリー', ssr: 'ミシック', ur: 'ミシック', er: 'ミシック', vr: 'エピック',
    r: 'レア', uc: 'アンコモン', c: 'コモン',
  },
  ko: {
    sr: '전설', ssr: '신화', ur: '신화', er: '신화', vr: '영웅',
    r: '희귀', uc: '고급', c: '일반',
  },
  'zh-Hans': {
    sr: '传奇', ssr: '神话', ur: '神话', er: '神话', vr: '史诗',
    r: '稀有', uc: '罕见', c: '普通',
  },
  'zh-Hant': {
    sr: '傳奇', ssr: '神話', ur: '神話', er: '神話', vr: '史詩',
    r: '稀有', uc: '罕見', c: '普通',
  },
  id: {
    sr: 'Legendaris', ssr: 'Mythic', ur: 'Mythic', er: 'Mythic', vr: 'Epik',
    r: 'Langka', uc: 'Tidak umum', c: 'Umum',
  },
  vi: {
    sr: 'Huyền thoại', ssr: 'Thần thoại', ur: 'Thần thoại', er: 'Thần thoại', vr: 'Sử thi',
    r: 'Hiếm', uc: 'Không phổ biến', c: 'Thường',
  },
  th: {
    sr: 'ตำนาน', ssr: 'มิธิก', ur: 'มิธิก', er: 'มิธิก', vr: 'มหากาพย์',
    r: 'หายาก', uc: 'ไม่ธรรมดา', c: 'ธรรมดา',
  },
  ar: {
    sr: 'أسطوري', ssr: 'خرافي', ur: 'خرافي', er: 'خرافي', vr: 'ملحمي',
    r: 'نادر', uc: 'غير شائع', c: 'شائع',
  },
};

export function getLoadoutPanelUi(lang: SupportedLanguage): LoadoutPanelUi {
  return PANEL_UI[lang] ?? PANEL_UI.en;
}

export function translateLoadoutClassLabel(classType: string, lang: SupportedLanguage): string {
  const code = String(classType || 'commando').toLowerCase();
  return CLASS_LABELS[lang]?.[code] ?? CLASS_LABELS.en[code] ?? classType;
}

export function translateLoadoutRarityLabel(rarityCode: string, lang: SupportedLanguage): string {
  const code = String(rarityCode || 'r').toLowerCase();
  return RARITY_LABELS[lang]?.[code] ?? RARITY_LABELS.en[code] ?? rarityCode;
}
