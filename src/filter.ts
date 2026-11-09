import type { FilterConfig, Vacancy } from "./types.js";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Збіг цілого слова/фрази без урахування регістру.
 * "java" не збігається з "JavaScript", а "node.js" знаходить "Node.js".
 */
export function matchesTerm(text: string, term: string): boolean {
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return re.test(text);
}

const matchesAny = (text: string, terms: string[]) =>
  terms.some((t) => matchesTerm(text, t));

export interface MatchResult {
  ok: boolean;
  reason?: string;
}

export interface MatchOptions {
  requireLocation?: boolean;
  /** Перевіряти лише виключення (для листів-алертів, відфільтрованих на сайті) */
  excludesOnly?: boolean;
}

export function matchVacancy(
  v: Vacancy,
  f: FilterConfig,
  opts: MatchOptions = {},
  now: Date = new Date(),
): MatchResult {
  const { requireLocation = false, excludesOnly = false } = opts;

  if (v.publishedAt && f.maxAgeHours > 0) {
    const ageHours = (now.getTime() - v.publishedAt.getTime()) / 3_600_000;
    if (ageHours > f.maxAgeHours) return { ok: false, reason: "надто стара" };
  }

  if (!excludesOnly && f.includeTitle.length > 0 && !matchesAny(v.title, f.includeTitle)) {
    return { ok: false, reason: "назва не підходить" };
  }

  if (matchesAny(v.title, f.excludeTitle)) {
    return { ok: false, reason: "слово-виключення в назві" };
  }

  if (matchesAny(`${v.title}\n${v.text}`, f.excludeText)) {
    return { ok: false, reason: "слово-виключення в описі" };
  }

  if (requireLocation && f.locations.length > 0) {
    if (!matchesAny(`${v.title}\n${v.text}`, f.locations)) {
      return { ok: false, reason: "локація/формат не підходять" };
    }
  }

  return { ok: true };
}
