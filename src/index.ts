import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dedupeKey } from "./dedupe.js";
import { matchVacancy } from "./filter.js";
import { loadState, saveState } from "./state.js";
import { fetchAts } from "./sources/ats.js";
import { fetchEmail } from "./sources/email.js";
import { fetchHtmlList } from "./sources/html.js";
import { fetchRss } from "./sources/rss.js";
import { fetchTelegramChannel } from "./sources/telegramChannel.js";
import { sendText, sendVacancy } from "./telegram.js";
import type { Config, SourceConfig, Vacancy } from "./types.js";
import { sleep } from "./util.js";

const CONFIG_PATH =
  process.env.CONFIG_PATH || fileURLToPath(new URL("../config.json", import.meta.url));
const STATE_PATH =
  process.env.STATE_PATH || fileURLToPath(new URL("../state/seen.json", import.meta.url));

/** Скільки вакансій максимум надсилати за один запуск, щоб не завалити чат. */
const MAX_PER_RUN = 20;
/** Після скількох невдалих запусків поспіль попередити в Telegram. */
const FAILURE_ALERT_AT = 8;

const dryRun = process.env.DRY_RUN === "1";

async function fetchSource(src: SourceConfig): Promise<Vacancy[]> {
  switch (src.type) {
    case "rss":
      return fetchRss(src);
    case "telegram":
      return fetchTelegramChannel(src);
    case "email":
      return fetchEmail(src);
    case "ats":
      return fetchAts(src);
    case "html":
      return fetchHtmlList(src);
    default:
      throw new Error(`Невідомий тип джерела: ${(src as SourceConfig).type}`);
  }
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  if (!dryRun && (!token || !chatId)) {
    throw new Error("Потрібні змінні TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID (або DRY_RUN=1)");
  }

  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as Config;
  const state = await loadState(STATE_PATH);
  const seen = new Set(state.seen);
  const baselined = new Set(state.baselined);
  const sources = config.sources.filter((s) => s.enabled !== false);

  const candidates: { v: Vacancy; key: string; src: SourceConfig }[] = [];
  const queued = new Set<string>();
  const newlyBaselined: string[] = [];

  for (const src of sources) {
    try {
      const items = await fetchSource(src);
      state.failures[src.name] = 0;
      console.log(`[${src.name}] отримано ${items.length}`);

      // Перший успішний запуск джерела: запам'ятовуємо все, що там уже є, і не надсилаємо.
      // Так нове джерело (чи щойно ввімкнена пошта) не засипає чат старими вакансіями.
      const isBaseline = !baselined.has(src.name);
      if (isBaseline) newlyBaselined.push(src.name);

      for (const v of items) {
        const key = dedupeKey(src, v);
        if (isBaseline) {
          seen.add(key);
          continue;
        }
        if (queued.has(key)) continue;
        queued.add(key);
        candidates.push({ v, key, src });
      }
      if (isBaseline) {
        console.log(`  перший запуск джерела: збережено ${items.length} наявних без надсилання`);
      }
    } catch (err) {
      const n = (state.failures[src.name] ?? 0) + 1;
      state.failures[src.name] = n;
      console.error(`[${src.name}] помилка (${n} поспіль): ${(err as Error).message}`);
      if (n === FAILURE_ALERT_AT && !dryRun) {
        await sendText(
          token,
          chatId,
          `Джерело «${src.name}» не працює ${n} запусків поспіль. Можливо, змінився URL чи вигляд сайту, або сайт заблокував запити.`,
        ).catch(() => undefined);
      }
    }
  }

  const fresh = candidates.filter(({ key }) => !seen.has(key));
  const toSend: { v: Vacancy; key: string }[] = [];

  for (const { v, key, src } of fresh) {
    const res = matchVacancy(v, config.filters, {
      requireLocation: src.requireLocation ?? false,
      excludesOnly: src.filterMode === "excludesOnly",
    });
    if (res.ok) {
      toSend.push({ v, key });
    } else {
      seen.add(key); // не підходить, більше не розглядаємо
      if (dryRun) console.log(`  ✗ ${v.title} (${res.reason})`);
    }
  }

  // Найстаріші першими, щоб у чаті порядок був хронологічним
  toSend.sort((a, b) => (a.v.publishedAt?.getTime() ?? 0) - (b.v.publishedAt?.getTime() ?? 0));

  const batch = toSend.slice(0, MAX_PER_RUN);
  for (const { v, key } of batch) {
    if (dryRun) {
      console.log(`  ✓ ${v.title} → ${v.url}`);
    } else {
      await sendVacancy(token, chatId, v);
      await sleep(300);
    }
    seen.add(key);
  }
  console.log(`Надіслано: ${batch.length}, залишилось у черзі: ${toSend.length - batch.length}`);

  if (!state.initialized && !dryRun) {
    await sendText(
      token,
      chatId,
      `Бот запущено. Слідкую за джерелами: ${sources.length}. Нові вакансії за твоїми критеріями будуть приходити сюди.`,
    );
  }

  if (dryRun) {
    console.log("DRY_RUN: стан не збережено.");
    return;
  }
  state.initialized = true;
  state.baselined = [...baselined, ...newlyBaselined];
  state.seen = [...seen];
  await saveState(STATE_PATH, state);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
