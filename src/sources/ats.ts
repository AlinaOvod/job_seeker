import type { AtsProvider, SourceConfig, Vacancy } from "../types.js";
import { fetchJson } from "../util.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const toDate = (x: unknown): Date | undefined => {
  if (x == null || x === "") return undefined;
  const d = new Date(typeof x === "number" ? x : String(x));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const compact = (...parts: unknown[]) =>
  parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);

/** Greenhouse: GET boards-api.greenhouse.io/v1/boards/{board}/jobs */
export function mapGreenhouse(json: any, source: string): Vacancy[] {
  return (json?.jobs ?? [])
    .filter((j: any) => j?.title && j?.absolute_url)
    .map((j: any): Vacancy => {
      const loc = j.location?.name;
      return {
        id: String(j.id),
        title: String(j.title).trim(),
        url: j.absolute_url,
        text: compact(loc).join("\n"),
        details: loc || undefined,
        publishedAt: toDate(j.first_published ?? j.updated_at),
        source,
      };
    });
}

/** Lever: GET api.lever.co/v0/postings/{board}?mode=json */
export function mapLever(json: any, source: string): Vacancy[] {
  return (Array.isArray(json) ? json : [])
    .filter((j: any) => j?.text && j?.hostedUrl)
    .map((j: any): Vacancy => {
      const c = j.categories ?? {};
      const info = compact(c.location, j.workplaceType, c.team, c.commitment);
      return {
        id: String(j.id),
        title: String(j.text).trim(),
        url: j.hostedUrl,
        text: info.join("\n"),
        details: compact(c.location, j.workplaceType).join(" · ") || undefined,
        publishedAt: toDate(j.createdAt),
        source,
      };
    });
}

/** Ashby: GET api.ashbyhq.com/posting-api/job-board/{board} */
export function mapAshby(json: any, source: string): Vacancy[] {
  return (json?.jobs ?? [])
    .filter((j: any) => j?.title && j?.jobUrl && j?.isListed !== false)
    .map((j: any): Vacancy => {
      const info = compact(j.location, j.isRemote ? "Remote" : "", j.department);
      return {
        id: String(j.id ?? j.jobUrl),
        title: String(j.title).trim(),
        url: j.jobUrl,
        text: info.join("\n"),
        details: compact(j.location, j.isRemote ? "Remote" : "").join(" · ") || undefined,
        publishedAt: toDate(j.publishedAt),
        source,
      };
    });
}

/** Workable: GET apply.workable.com/api/v1/widget/accounts/{board}?details=true */
export function mapWorkable(json: any, source: string): Vacancy[] {
  return (json?.jobs ?? [])
    .filter((j: any) => j?.title && (j?.url || j?.shortlink))
    .map((j: any): Vacancy => {
      const place = compact(j.city, j.country).join(", ");
      return {
        id: String(j.shortcode ?? j.url),
        title: String(j.title).trim(),
        url: j.url ?? j.shortlink,
        text: compact(place, j.telecommuting ? "Remote" : "", j.department).join("\n"),
        details: compact(place, j.telecommuting ? "Remote" : "").join(" · ") || undefined,
        publishedAt: toDate(j.published_on ?? j.created_at),
        source,
      };
    });
}

/** SmartRecruiters: GET api.smartrecruiters.com/v1/companies/{board}/postings */
export function mapSmartRecruiters(json: any, source: string, board: string): Vacancy[] {
  return (json?.content ?? [])
    .filter((j: any) => j?.name && j?.id)
    .map((j: any): Vacancy => {
      const l = j.location ?? {};
      const place = compact(l.city, l.country ? String(l.country).toUpperCase() : "").join(", ");
      return {
        id: String(j.id),
        title: String(j.name).trim(),
        url: `https://jobs.smartrecruiters.com/${board}/${j.id}`,
        text: compact(place, l.remote ? "Remote" : "", j.department?.label).join("\n"),
        details: compact(place, l.remote ? "Remote" : "").join(" · ") || undefined,
        publishedAt: toDate(j.releasedDate),
        source,
      };
    });
}

/** Breezy HR: GET {board}.breezy.hr/json */
export function mapBreezy(json: any, source: string): Vacancy[] {
  return (Array.isArray(json) ? json : [])
    .filter((j: any) => j?.name && j?.url)
    .map((j: any): Vacancy => {
      const l = j.location ?? {};
      const remote = l.is_remote ? "Remote" : "";
      return {
        id: String(j.id ?? j.url),
        title: String(j.name).trim(),
        url: j.url,
        text: compact(l.name, remote, j.department).join("\n"),
        details: compact(l.name, remote).join(" · ") || undefined,
        publishedAt: toDate(j.published_date),
        source,
      };
    });
}

export function atsUrl(provider: AtsProvider, board: string): string {
  const b = encodeURIComponent(board);
  switch (provider) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${b}/jobs`;
    case "lever":
      return `https://api.lever.co/v0/postings/${b}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${b}`;
    case "workable":
      return `https://apply.workable.com/api/v1/widget/accounts/${b}?details=true`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${b}/postings?limit=100`;
    case "breezy":
      return `https://${b}.breezy.hr/json`;
  }
}

export async function fetchAts(src: SourceConfig): Promise<Vacancy[]> {
  if (!src.provider || !src.board) {
    throw new Error(`У джерела "${src.name}" потрібні provider і board`);
  }
  const json = await fetchJson(atsUrl(src.provider, src.board));
  switch (src.provider) {
    case "greenhouse":
      return mapGreenhouse(json, src.name);
    case "lever":
      return mapLever(json, src.name);
    case "ashby":
      return mapAshby(json, src.name);
    case "workable":
      return mapWorkable(json, src.name);
    case "smartrecruiters":
      return mapSmartRecruiters(json, src.name, src.board);
    case "breezy":
      return mapBreezy(json, src.name);
  }
}
