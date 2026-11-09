import type { SourceConfig, Vacancy } from "./types.js";

/** Прибирає параметри, фрагмент і кінцевий слеш, щоб одне посилання завжди виглядало однаково. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * Ключ для запам'ятовування вже надісланих вакансій.
 * Для RSS і пошти це посилання: одна вакансія з двох стрічок (або з листа й стрічки) не надійде двічі.
 * Для Telegram-каналів це id посту, бо різні пости можуть вести на одне й те саме посилання.
 */
export function dedupeKey(src: SourceConfig, v: Vacancy): string {
  const byUrl = src.type !== "telegram" || v.canonicalUrl === true;
  return byUrl ? `url:${normalizeUrl(v.url)}` : `tg:${v.id}`;
}
