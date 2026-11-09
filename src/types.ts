export interface Vacancy {
  /** Унікальний id в межах джерела (guid, посилання, id посту) */
  id: string;
  title: string;
  company?: string;
  /** Куди веде кнопка «Відгукнутися» */
  url: string;
  /** Опис вакансії простим текстом (може бути порожнім) */
  text: string;
  /** Короткий рядок під назвою в повідомленні (компанія · місто), якщо відомий */
  details?: string;
  /** true, якщо url веде прямо на вакансію (пост-дайджест у Telegram), тож дублікати шукаємо за посиланням */
  canonicalUrl?: boolean;
  publishedAt?: Date;
  source: string;
}

/** Правило розбору листів-алертів одного сайту. */
export interface EmailRule {
  /** Назва правила, для логів */
  name: string;
  /** Підрядок адреси відправника, напр. "linkedin.com" */
  fromContains: string;
  /** Регулярний вираз посилання на вакансію; перша група захоплення = id вакансії */
  linkPattern: string;
  /** Канонічне посилання з id, напр. "https://www.linkedin.com/jobs/view/{id}/". Якщо не задано, береться посилання з листа без параметрів */
  urlTemplate?: string;
}

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";

export interface SourceConfig {
  type: "rss" | "telegram" | "email" | "ats" | "html";
  name: string;
  /** Для type = "ats": система найму компанії */
  provider?: AtsProvider;
  /** Для type = "ats": ідентифікатор компанії в цій системі (з адреси її сторінки вакансій) */
  board?: string;
  /** Для type = "html": сторінки зі списком вакансій */
  urls?: string[];
  /** Для type = "html": регулярний вираз посилання на вакансію; перша група захоплення = id */
  linkPattern?: string;
  /** Для type = "rss" */
  url?: string;
  /** Для type = "telegram": ім'я публічного каналу без @ */
  channel?: string;
  /** Для type = "email": правила розбору листів різних сайтів */
  rules?: EmailRule[];
  /** Для type = "email": папка, за замовчуванням INBOX */
  mailbox?: string;
  /** Для type = "email": скільки днів назад дивитись листи, за замовчуванням 2 */
  lookbackDays?: number;
  /** Якщо true, вакансія має містити одне зі слів із filters.locations */
  requireLocation?: boolean;
  /**
   * "full" (за замовчуванням): назва має містити includeTitle і не містити excludeTitle.
   * "excludesOnly": перевіряти лише виключення. Підходить для листів-алертів, де ти вже
   * відфільтрувала вакансії на самому сайті.
   */
  filterMode?: "full" | "excludesOnly";
  enabled?: boolean;
}

export interface FilterConfig {
  /** Хоча б одне з цих слів має бути в назві */
  includeTitle: string[];
  /** Жодне з цих слів не має бути в назві */
  excludeTitle: string[];
  /** Жодне з цих слів не має бути в назві чи описі */
  excludeText: string[];
  /** Слова для перевірки локації/формату (remote, Київ…) */
  locations: string[];
  /** Ігнорувати вакансії старіші за N годин (якщо дата відома) */
  maxAgeHours: number;
}

export interface Config {
  filters: FilterConfig;
  sources: SourceConfig[];
}

export interface State {
  initialized: boolean;
  seen: string[];
  /** Джерела, які вже пройшли перший («базовий») запуск без надсилання */
  baselined: string[];
  /** Скільки запусків поспіль джерело не відповідало */
  failures: Record<string, number>;
}
