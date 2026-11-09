import type { SourceConfig, Vacancy } from "../types.js";
import { fetchText } from "../util.js";
import { extractVacancies } from "./emailParse.js";

/**
 * Читає сторінки зі списком вакансій на сайті компанії: знаходить посилання за шаблоном
 * linkPattern. Підходить для сайтів, які віддають список у самому HTML.
 * Не працює для сайтів, що підвантажують список скриптом (тоді вакансій знайдеться 0).
 */
export async function fetchHtmlList(src: SourceConfig): Promise<Vacancy[]> {
  if (!src.urls?.length || !src.linkPattern) {
    throw new Error(`У джерела "${src.name}" потрібні urls і linkPattern`);
  }

  const rule = { name: src.name, fromContains: "", linkPattern: src.linkPattern };
  const out: Vacancy[] = [];

  for (const url of src.urls) {
    const html = await fetchText(url);
    out.push(...extractVacancies(html, rule, src.name, new Date(), url));
  }

  if (out.length === 0) {
    // Тихий «нуль» означав би, що ми ніколи нічого не побачимо; краще явна помилка
    throw new Error(
      "на сторінці не знайдено жодної вакансії: сайт, імовірно, підвантажує список скриптом або змінив верстку",
    );
  }
  return out;
}
