/**
 * Визначає, на якій системі найму працює сторінка вакансій компанії.
 *
 *   npm run detect -- https://careers.example.com/ https://other.example.org/jobs
 *
 * Для підтримуваних систем друкує готовий блок для config.json.
 */
import { detectAts, isAtsProvider } from "./detect.js";
import { fetchText } from "./util.js";

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Використання: npm run detect -- <адреса сторінки вакансій> [ще адреси…]");
  process.exit(1);
}

for (const url of urls) {
  console.log(`\n=== ${url}`);
  let html: string;
  try {
    html = await fetchText(url);
  } catch (err) {
    console.log(`  не вдалося відкрити: ${(err as Error).message}`);
    continue;
  }

  const found = detectAts(html);
  if (found.length === 0) {
    console.log(
      "  Відомих систем найму не знайдено. Імовірно, сайт має власний API або підвантажує список скриптом.\n" +
        "  Спробуй тип \"html\" (якщо список є прямо в HTML сторінки) або глянь у браузері DevTools → Network.",
    );
    continue;
  }

  for (const d of found) {
    if (d.supported && isAtsProvider(d.system) && d.board) {
      const host = new URL(url).hostname.replace(/^(www|careers?|jobs)\./, "");
      const block = {
        type: "ats",
        name: host,
        provider: d.system,
        board: d.board,
        requireLocation: true,
        enabled: true,
      };
      console.log(`  ✓ ${d.system} (${d.board}). Додай у "sources":\n${JSON.stringify(block, null, 2)}`);
    } else {
      console.log(`  • ${d.system}${d.board ? ` (${d.board})` : ""}: бот поки не вміє читати цю систему`);
    }
  }
}
