import type { SourceConfig, Vacancy } from "../types.js";
import { fetchText, stripHtml } from "../util.js";

const ANCHOR_RE = /<a\b[^>]*?\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const isTelegramLink = (href: string) => /^https?:\/\/(t|telegram)\.me\//i.test(href);

/**
 * Пост-дайджест: багато вакансій в одному пості, кожна у вигляді
 *   ▪️ [Назва](посилання) в [Компанія](посилання)
 *   віддалено
 * Вакансією вважаємо рядок, що починається з посилання (перед ним лише маркер списку).
 */
export function parseDigest(
  body: string,
  post: string,
  datetime: string | undefined,
  source: string,
): Vacancy[] {
  const lines = body.split(/<br\s*\/?>/i);
  const out: Vacancy[] = [];

  lines.forEach((line, i) => {
    const anchors = [...line.matchAll(ANCHOR_RE)];
    const first = anchors[0];
    if (!first) return;

    const href = first[2].replace(/&amp;/g, "&").trim();
    if (!/^https?:\/\//i.test(href) || isTelegramLink(href)) return;

    const before = stripHtml(line.slice(0, first.index)).replace(/[^\p{L}\p{N}]/gu, "");
    if (before) return; // перед посиланням є текст: це не рядок-вакансія

    const title = stripHtml(first[3]).replace(/\s+/g, " ").trim();
    if (title.length < 3) return;

    const company = anchors[1] ? stripHtml(anchors[1][3]).trim() : "";
    const next = lines[i + 1];
    const place = next && !/<a\b/i.test(next) ? stripHtml(next).replace(/\s+/g, " ").trim() : "";

    out.push({
      id: `${post}#${out.length + 1}`,
      title: title.slice(0, 140),
      url: href,
      text: [title, company, place].filter(Boolean).join("\n"),
      details: [company, place].filter(Boolean).join(" · ").slice(0, 120) || undefined,
      canonicalUrl: true,
      publishedAt: datetime ? new Date(datetime) : undefined,
      source,
    });
  });

  return out;
}

/**
 * Читає публічний канал через веб-версію https://t.me/s/<канал>.
 * Працює лише для каналів, у яких увімкнено веб-перегляд, і без жодних ключів.
 */
export function parseChannelHtml(html: string, source: string): Vacancy[] {
  const out: Vacancy[] = [];
  const chunks = html.split("tgme_widget_message_wrap").slice(1);

  for (const chunk of chunks) {
    const post = /data-post="([^"]+)"/.exec(chunk)?.[1];
    const body = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1];
    if (!post || !body) continue;

    const datetime = /<time[^>]*datetime="([^"]+)"/.exec(chunk)?.[1];

    // Дайджест (≥2 вакансій у пості) розбиваємо на окремі вакансії
    const digest = parseDigest(body, post, datetime, source);
    if (digest.length >= 2) {
      out.push(...digest);
      continue;
    }

    const text = stripHtml(body);
    if (!text) continue;

    const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? text;
    const externalLink = [...body.matchAll(/href="(https?:\/\/(?!t\.me)[^"]+)"/g)][0]?.[1];

    out.push({
      id: post,
      title: firstLine.trim().slice(0, 140),
      url: externalLink?.replace(/&amp;/g, "&") ?? `https://t.me/${post}`,
      text,
      publishedAt: datetime ? new Date(datetime) : undefined,
      source,
    });
  }

  return out;
}

export async function fetchTelegramChannel(src: SourceConfig): Promise<Vacancy[]> {
  if (!src.channel) throw new Error(`У джерела "${src.name}" немає channel`);
  const html = await fetchText(`https://t.me/s/${encodeURIComponent(src.channel)}`);
  return parseChannelHtml(html, src.name);
}
