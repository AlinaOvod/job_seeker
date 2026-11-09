import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { SourceConfig, Vacancy } from "../types.js";
import { extractVacancies } from "./emailParse.js";

/**
 * Читає листи-алерти (Djinni, LinkedIn, Work.ua…) з поштової скриньки через IMAP.
 * Скринька відкривається лише на читання: бот нічого не позначає прочитаним і не видаляє.
 *
 * Змінні середовища:
 *   IMAP_USER, IMAP_PASSWORD (для Gmail це App Password), IMAP_HOST (за замовчуванням imap.gmail.com), IMAP_PORT (993)
 */
export async function fetchEmail(src: SourceConfig): Promise<Vacancy[]> {
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!user || !pass) {
    throw new Error("Для джерела email потрібні змінні IMAP_USER і IMAP_PASSWORD");
  }
  if (!src.rules?.length) throw new Error(`У джерела "${src.name}" немає rules`);

  const client = new ImapFlow({
    // `||`, а не `??`: порожній секрет у GitHub Actions приходить як порожній рядок
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const since = new Date(Date.now() - (src.lookbackDays ?? 2) * 86_400_000);
  const out: Vacancy[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(src.mailbox ?? "INBOX", { readOnly: true });
    try {
      for (const rule of src.rules) {
        const uids = (await client.search({ since, from: rule.fromContains }, { uid: true })) || [];
        let found = 0;

        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
          if (!msg || !msg.source) continue;

          const parsed = await simpleParser(msg.source);
          const html = parsed.html || parsed.textAsHtml || "";
          const received = parsed.date ?? (msg.internalDate ? new Date(msg.internalDate) : new Date());
          const items = extractVacancies(html, rule, `${src.name} · ${rule.name}`, received);
          found += items.length;
          out.push(...items);
        }

        console.log(`  [${rule.name}] листів: ${uids.length}, вакансій у них: ${found}`);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return out;
}
