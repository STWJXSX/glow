import type { SupportedLanguage } from '#helpers/locales/languages.ts';
import type { LockerCosmeticType } from './types.ts';

type LabelMap = Record<SupportedLanguage, string>;

const CATEGORY_LABELS: Record<LockerCosmeticType, LabelMap> = {
  outfit: {
    en: 'Skins', es: 'Skins', 'es-419': 'Skins', de: 'Skins', fr: 'Skins', it: 'Skin',
    'pt-BR': 'Skins', pl: 'Skiny', ru: 'Образы', tr: 'Kostümler', ja: 'スキン', ko: '스킨',
    'zh-Hans': '服装', 'zh-Hant': '服裝', id: 'Skin', vi: 'Skin', th: 'สกิน', ar: 'الأزياء',
  },
  backpack: {
    en: 'Back Blings', es: 'Accesorios', 'es-419': 'Accesorios', de: 'Rucksäcke', fr: 'Accessoires de dos',
    it: 'Dorsi decorativi', 'pt-BR': 'Acessórios', pl: 'Plecaki', ru: 'Рюкзаки', tr: 'Sırt aksesuarları',
    ja: 'バックアクセサリー', ko: '백블링', 'zh-Hans': '背部配饰', 'zh-Hant': '背部配飾',
    id: 'Back Bling', vi: 'Phụ kiện lưng', th: 'ของติดหลัง', ar: 'إكسسوارات الظهر',
  },
  pickaxe: {
    en: 'Pickaxes', es: 'Picos', 'es-419': 'Picos', de: 'Spitzhacken', fr: 'Pioches', it: 'Picconi',
    'pt-BR': 'Picaretas', pl: 'Kilofy', ru: 'Кирки', tr: 'Kazmalar', ja: 'ツルハシ', ko: '곡괭이',
    'zh-Hans': '镐', 'zh-Hant': '鎬', id: 'Pickaxe', vi: 'Cuốc chim', th: 'จอบ', ar: 'الفؤوس',
  },
  glider: {
    en: 'Gliders', es: 'Planeadores', 'es-419': 'Planeadores', de: 'Gleiter', fr: 'Planeurs', it: 'Deltaplani',
    'pt-BR': 'Asas-delta', pl: 'Lotnie', ru: 'Дельтапланы', tr: 'Kanatlar', ja: 'グライダー', ko: '글라이더',
    'zh-Hans': '滑翔伞', 'zh-Hant': '滑翔傘', id: 'Glider', vi: 'Tàu lượn', th: 'ร่มร่อน', ar: 'الطائرات الشراعية',
  },
  emote: {
    en: 'Emotes', es: 'Gestos', 'es-419': 'Gestos', de: 'Emotes', fr: 'Emotes', it: 'Emote',
    'pt-BR': 'Emotes', pl: 'Emotki', ru: 'Эмоции', tr: 'Jestler', ja: 'エモート', ko: '이모트',
    'zh-Hans': '表情', 'zh-Hant': '表情', id: 'Emote', vi: 'Emote', th: 'ท่าทาง', ar: 'الإيموتات',
  },
  spray: {
    en: 'Sprays', es: 'Grafitis', 'es-419': 'Grafitis', de: 'Sprays', fr: 'Sprays', it: 'Spray',
    'pt-BR': 'Sprays', pl: 'Graffiti', ru: 'Граффити', tr: 'Spreyler', ja: 'スプレー', ko: '스프레이',
    'zh-Hans': '喷漆', 'zh-Hant': '噴漆', id: 'Spray', vi: 'Spray', th: 'สเปรย์', ar: 'الرسومات',
  },
  emoticon: {
    en: 'Emoticons', es: 'Iconos', 'es-419': 'Íconos', de: 'Emoticons', fr: 'Émoticônes', it: 'Emoticon',
    'pt-BR': 'Emoticons', pl: 'Emotikony', ru: 'Смайлики', tr: 'İfadeler', ja: 'エモティコン', ko: '이모티콘',
    'zh-Hans': '表情符号', 'zh-Hant': '表情符號', id: 'Emoticon', vi: 'Biểu tượng', th: 'ไอคอน', ar: 'الرموز',
  },
  toy: {
    en: 'Toys', es: 'Juguetes', 'es-419': 'Juguetes', de: 'Spielzeuge', fr: 'Jouets', it: 'Giocattoli',
    'pt-BR': 'Brinquedos', pl: 'Zabawki', ru: 'Игрушки', tr: 'Oyuncaklar', ja: 'おもちゃ', ko: '장난감',
    'zh-Hans': '玩具', 'zh-Hant': '玩具', id: 'Mainan', vi: 'Đồ chơi', th: 'ของเล่น', ar: 'الألعاب',
  },
  wrap: {
    en: 'Wraps', es: 'Envolturas', 'es-419': 'Envolturas', de: 'Folierungen', fr: 'Habillages', it: 'Coperture',
    'pt-BR': 'Envelopamentos', pl: 'Okleiny', ru: 'Обёртки', tr: 'Kaplamalar', ja: 'ラップ', ko: '랩',
    'zh-Hans': '涂装', 'zh-Hant': '塗裝', id: 'Wrap', vi: 'Bọc', th: 'ลายห่อ', ar: 'الأغلفة',
  },
  music: {
    en: 'Music', es: 'Música', 'es-419': 'Música', de: 'Musik', fr: 'Musique', it: 'Musica',
    'pt-BR': 'Música', pl: 'Muzyka', ru: 'Музыка', tr: 'Müzik', ja: 'ミュージック', ko: '음악',
    'zh-Hans': '音乐', 'zh-Hant': '音樂', id: 'Musik', vi: 'Nhạc', th: 'เพลง', ar: 'الموسيقى',
  },
  loadingscreen: {
    en: 'Loading Screens', es: 'Pantallas', 'es-419': 'Pantallas', de: 'Ladebildschirme', fr: 'Écrans de chargement',
    it: 'Schermate', 'pt-BR': 'Telas', pl: 'Ekrany', ru: 'Загрузочные экраны', tr: 'Yükleme ekranları',
    ja: 'ロード画面', ko: '로딩 화면', 'zh-Hans': '加载界面', 'zh-Hant': '載入畫面',
    id: 'Layar', vi: 'Màn hình', th: 'หน้าโหลด', ar: 'شاشات التحميل',
  },
  contrail: {
    en: 'Contrails', es: 'Estelas', 'es-419': 'Estelas', de: 'Kondensstreifen', fr: 'Traînées', it: 'Scie',
    'pt-BR': 'Rastros', pl: 'Smugi', ru: 'Следы', tr: 'İzler', ja: 'コントレイル', ko: '비행운',
    'zh-Hans': '尾迹', 'zh-Hant': '尾跡', id: 'Jejak', vi: 'Vệt', th: 'ร่องรอย', ar: 'الذيول',
  },
  companion: {
    en: 'Companions', es: 'Compañeros', 'es-419': 'Compañeros', de: 'Begleiter', fr: 'Compagnons', it: 'Compagni',
    'pt-BR': 'Companheiros', pl: 'Towarzysze', ru: 'Спутники', tr: 'Yoldaşlar', ja: '相棒', ko: '동료',
    'zh-Hans': '伙伴', 'zh-Hant': '夥伴', id: 'Pendamping', vi: 'Bạn đồng hành', th: 'เพื่อน', ar: 'الرفقاء',
  },
  shoes: {
    en: 'Kicks', es: 'Zapatillas', 'es-419': 'Zapatillas', de: 'Schuhe', fr: 'Baskets', it: 'Scarpe',
    'pt-BR': 'Tênis', pl: 'Buty', ru: 'Обувь', tr: 'Ayakkabılar', ja: 'シューズ', ko: '신발',
    'zh-Hans': '鞋', 'zh-Hant': '鞋', id: 'Sepatu', vi: 'Giày', th: 'รองเท้า', ar: 'أحذية',
  },
  vehicle: {
    en: 'Cars', es: 'Coches', 'es-419': 'Carros', de: 'Fahrzeuge', fr: 'Voitures', it: 'Auto',
    'pt-BR': 'Carros', pl: 'Samochody', ru: 'Машины', tr: 'Arabalar', ja: 'カー', ko: '자동차',
    'zh-Hans': '载具', 'zh-Hant': '載具', id: 'Mobil', vi: 'Xe', th: 'รถ', ar: 'السيارات',
  },
};

const SUBMITTED_BY: LabelMap = {
  en: 'Submitted by', es: 'Enviado por', 'es-419': 'Enviado por', de: 'Eingereicht von', fr: 'Soumis par',
  it: 'Inviato da', 'pt-BR': 'Enviado por', pl: 'Przesłane przez', ru: 'Отправлено', tr: 'Gönderen',
  ja: '提出者', ko: '제출자', 'zh-Hans': '提交者', 'zh-Hant': '提交者', id: 'Dikirim oleh',
  vi: 'Gửi bởi', th: 'ส่งโดย', ar: 'مقدم من',
};

export function getCategoryLabel(type: LockerCosmeticType, lang: SupportedLanguage): string {
  return CATEGORY_LABELS[type][lang] ?? CATEGORY_LABELS[type].en;
}

export function getSubmittedByLabel(lang: SupportedLanguage): string {
  return SUBMITTED_BY[lang] ?? SUBMITTED_BY.en;
}

export function formatLockerDate(date: Date, lang: SupportedLanguage): string {
  try {
    return date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}

export function formatLockerFooterDate(date: Date): string {
  const m = String(date.getMonth() + 1);
  const d = String(date.getDate());
  const y = String(date.getFullYear());
  return `${m}/${d}/${y}`;
}

export function formatCountLine(total: number): string {
  return String(total);
}
