import type { EmailRule, Vacancy } from "../types.js";
import { stripHtml } from "../util.js";

/** Тексти кнопок, які не є назвою вакансії. */
const GENERIC_LINK_TEXT =
  /^(view( the)? jobs?|see( the)? jobs?|apply( now)?|easy apply|learn more|details|read more|more|переглянути( вакансію)?|подивитись|детальніше|відгукнутися|відкрити|смотреть|подробнее)\W*$/i;

const ANCHOR_RE = /<a\b[^>]*?\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function cleanUrl(candidate: string, matchIndex: number): string {
  const start = candidate.lastIndexOf("http", matchIndex);
  const from = start >= 0 ? candidate.slice(start) : candidate;
  return from.split(/[?#&\s"'<>]/)[0];
}

interface Hit {
  id: string;
  url: string;
  text: string;
  start: number;
  end: number;
}

/**
 * Дістає вакансії з HTML листа-алерта за правилом сайту.
 * Одна вакансія зазвичай має кілька посилань (картинка, назва, кнопка): групуємо їх за id
 * і беремо перший змістовний текст як назву.
 */
export function extractVacancies(
  html: string,
  rule: EmailRule,
  source: string,
  receivedAt: Date,
  /** Адреса сторінки: потрібна, щоб відносні посилання (/vacancies/…) стали повними */
  baseUrl?: string,
): Vacancy[] {
  const pattern = new RegExp(rule.linkPattern, "i");
  const hits: Hit[] = [];

  for (const m of html.matchAll(ANCHOR_RE)) {
    let href = m[2].replace(/&amp;/g, "&").trim();
    if (baseUrl && !/^https?:/i.test(href)) {
      try {
        href = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }
    // Деякі листи загортають посилання в трекінг-редірект, тож пробуємо й розкодований варіант
    const variants = [href, safeDecode(href), safeDecode(safeDecode(href))];
    for (const candidate of variants) {
      const hit = pattern.exec(candidate);
      if (!hit?.[1]) continue;
      const id = hit[1];
      const url = rule.urlTemplate
        ? rule.urlTemplate.replace("{id}", id)
        : cleanUrl(candidate, hit.index);
      hits.push({
        id,
        url,
        text: stripHtml(m[3]).replace(/\s+/g, " ").trim(),
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
      });
      break;
    }
  }

  const out: Vacancy[] = [];
  const done = new Set<string>();

  for (const h of hits) {
    if (done.has(h.id)) continue;
    const title = hits.find((x) => x.id === h.id && x.text.length >= 3 && !GENERIC_LINK_TEXT.test(x.text));
    if (!title) continue; // у листі лише кнопки без назви, нічого показати
    done.add(h.id);

    // Контекст: текст між цим посиланням і наступним посиланням на іншу вакансію
    const titleIndex = hits.indexOf(title);
    const next = hits.slice(titleIndex + 1).find((x) => x.id !== h.id);
    const context = stripHtml(html.slice(title.end, next ? next.start : title.end + 600))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !GENERIC_LINK_TEXT.test(l));

    const details = context[0] && context[0].length <= 100 ? context[0] : undefined;

    out.push({
      id: h.id,
      title: title.text.slice(0, 140),
      url: h.url,
      text: context.join("\n").slice(0, 400),
      details,
      publishedAt: receivedAt,
      source,
    });
  }

  return out;
}
