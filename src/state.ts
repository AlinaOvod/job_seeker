import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { State } from "./types.js";

const MAX_SEEN = 15000;

export const emptyState = (): State => ({
  initialized: false,
  seen: [],
  baselined: [],
  failures: {},
});

export async function loadState(path: string): Promise<State> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<State>;
    return {
      initialized: raw.initialized ?? false,
      seen: raw.seen ?? [],
      baselined: raw.baselined ?? [],
      failures: raw.failures ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw err;
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  const trimmed: State = { ...state, seen: state.seen.slice(-MAX_SEEN) };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(trimmed, null, 2) + "\n", "utf8");
}
