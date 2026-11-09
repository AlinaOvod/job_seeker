import { XMLParser } from "fast-xml-parser";
import type { SourceConfig, Vacancy } from "../types.js";
import { fetchText, stripHtml } from "../util.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

const asArray = <T>(x: T | T[] | undefined | null): T[] =>
  x == null ? [] : Array.isArray(x) ? x : [x];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const str = (x: any): string =>
  x == null ? "" : typeof x === "object" ? String(x["#text"] ?? "") : String(x);

const toDate = (s: string): Date | undefined => {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Розбирає RSS 2.0 та Atom. */
export function parseFeed(xml: string, source: string): Vacancy[] {
  const doc = parser.parse(xml);
  const out: Vacancy[] = [];

  for (const it of asArray(doc?.rss?.channel?.item)) {
    const url = str(it.link).trim();
    const title = stripHtml(str(it.title));
    if (!url || !title) continue;
    out.push({
      id: str(it.guid).trim() || url,
      title,
      url,
      text: stripHtml(str(it.description)),
      publishedAt: toDate(str(it.pubDate)),
      source,
    });
  }

  for (const it of asArray(doc?.feed?.entry)) {
    const link = asArray(it.link)[0];
    const url = (typeof link === "object" ? str(link?.["@_href"]) : str(link)).trim();
    const title = stripHtml(str(it.title));
    if (!url || !title) continue;
    out.push({
      id: str(it.id).trim() || url,
      title,
      url,
      text: stripHtml(str(it.summary) || str(it.content)),
      publishedAt: toDate(str(it.published) || str(it.updated)),
      source,
    });
  }

  return out;
}

export async function fetchRss(src: SourceConfig): Promise<Vacancy[]> {
  if (!src.url) throw new Error(`У джерела "${src.name}" немає url`);
  const xml = await fetchText(src.url);
  return parseFeed(xml, src.name);
}
