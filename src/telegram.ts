import type { Vacancy } from "./types.js";
import { sleep } from "./util.js";

// Змінна потрібна лише для локальних тестів з фейковим сервером
const API_URL = process.env.TELEGRAM_API_URL || "https://api.telegram.org";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function call(token: string, method: string, body: object): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API_URL}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
    };
    if (json.ok) return;
    if (json.error_code === 429 && attempt === 0) {
      await sleep((json.parameters?.retry_after ?? 3) * 1000);
      continue;
    }
    throw new Error(`Telegram ${method}: ${json.description ?? "невідома помилка"}`);
  }
}

export function formatVacancy(v: Vacancy): string {
  const lines = [`<b>${escapeHtml(v.title)}</b>`];
  if (v.company) lines.push(escapeHtml(v.company));
  if (v.details) lines.push(escapeHtml(v.details));
  lines.push(`<i>${escapeHtml(v.source)}</i>`);
  return lines.join("\n");
}

export async function sendVacancy(token: string, chatId: string, v: Vacancy): Promise<void> {
  await call(token, "sendMessage", {
    chat_id: chatId,
    text: formatVacancy(v),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: "Відгукнутися", url: v.url }]],
    },
  });
}

export async function sendText(token: string, chatId: string, text: string): Promise<void> {
  await call(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}
