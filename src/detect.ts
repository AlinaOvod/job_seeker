import type { AtsProvider } from "./types.js";

export interface Detection {
  /** Система найму */
  system: string;
  /** Ідентифікатор компанії в системі (якщо вдалося знайти) */
  board?: string;
  /** Чи вміє бот читати цю систему */
  supported: boolean;
}

interface Marker {
  system: string;
  re: RegExp;
  supported: boolean;
  /** Значення, які не є ідентифікатором компанії */
  ignore?: string[];
}

const MARKERS: Marker[] = [
  {
    system: "greenhouse",
    re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/i,
    supported: true,
    ignore: ["embed", "v1"],
  },
  {
    system: "greenhouse",
    re: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i,
    supported: true,
  },
  { system: "lever", re: /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/i, supported: true },
  { system: "ashby", re: /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/i, supported: true },
  {
    system: "workable",
    re: /apply\.workable\.com\/([a-z0-9_-]+)/i,
    supported: true,
    ignore: ["api", "j"],
  },
  {
    system: "smartrecruiters",
    re: /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/,
    supported: true,
  },
  {
    system: "breezy",
    re: /([a-z0-9-]+)\.breezy\.hr/i,
    supported: true,
    ignore: ["www", "app", "api", "assets", "embed"],
  },
  { system: "workday", re: /([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com/i, supported: false },
  { system: "personio", re: /([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i, supported: false },
  { system: "teamtailor", re: /([a-z0-9-]+)\.teamtailor\.com/i, supported: false },
  {
    system: "recruitee",
    re: /([a-z0-9-]+)\.recruitee\.com/i,
    supported: true,
    ignore: ["www", "app", "api", "assets", "careers"],
  },
  { system: "bamboohr", re: /([a-z0-9-]+)\.bamboohr\.com\/(?:jobs|careers)/i, supported: false },
  { system: "comeet", re: /comeet\.(?:co|com)\/jobs\/([a-z0-9-]+)/i, supported: false },
  { system: "icims", re: /([a-z0-9-]+)\.icims\.com/i, supported: false },
  { system: "successfactors", re: /([a-z0-9-]+)\.successfactors\.(?:eu|com)/i, supported: false },
];

/** Шукає в HTML сторінки кар'єр сліди відомих систем найму. */
export function detectAts(html: string): Detection[] {
  const found = new Map<string, Detection>();
  for (const m of MARKERS) {
    // Перебираємо всі збіги: перший може бути службовим (напр. шлях скрипта embed)
    const all = new RegExp(m.re.source, m.re.flags.replace("g", "") + "g");
    for (const hit of html.matchAll(all)) {
      const board = hit[1];
      if (m.ignore?.includes(board.toLowerCase())) continue;
      found.set(`${m.system}:${board.toLowerCase()}`, {
        system: m.system,
        board,
        supported: m.supported,
      });
      break;
    }
  }
  return [...found.values()];
}

export const isAtsProvider = (s: string): s is AtsProvider =>
  ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "breezy", "recruitee"].includes(s);
