import { createStore, del, get, set } from 'idb-keyval';
import heliski from '../plans/heliski.json';
import type { Plan, Weekday } from './types';
import type { RunState } from './engine/run';

const db = createStore('training-player', 'kv');

export interface StoredPlan {
  plan: Plan;
  importedAt: string;
  builtin?: boolean;
}

export interface Settings {
  activePlanId?: string;
  /** Environment per plan id. */
  environment: Record<string, string>;
  sound: boolean;
  autoAdvance: boolean;
  /** "Get ready" seconds before a timed exercise you started by tapping. 0 disables. */
  prepSeconds: number;
}

export interface LogEntry {
  id: string;
  planId: string;
  /** Local date the session was done, YYYY-MM-DD. */
  date: string;
  week: number;
  weekday: Weekday;
  phaseId?: string;
  environment: string;
  values: Record<string, number | string | boolean | null>;
  startedAt: number;
  finishedAt: number;
}

export interface Backup {
  app: 'training-player';
  version: 1;
  exportedAt: string;
  plans: StoredPlan[];
  logs: LogEntry[];
  settings: Settings;
}

const BUILTIN: StoredPlan[] = [{ plan: heliski as unknown as Plan, importedAt: '', builtin: true }];

export const DEFAULT_SETTINGS: Settings = { environment: {}, sound: true, autoAdvance: true, prepSeconds: 5 };

/** Built-in plans plus imported ones; an import with the same id replaces the built-in. */
export async function loadPlans(): Promise<StoredPlan[]> {
  const stored = (await get<StoredPlan[]>('plans', db)) ?? [];
  const ids = new Set(stored.map((p) => p.plan.id));
  return [...stored, ...BUILTIN.filter((b) => !ids.has(b.plan.id))];
}

export async function savePlan(plan: Plan): Promise<void> {
  const stored = ((await get<StoredPlan[]>('plans', db)) ?? []).filter((p) => p.plan.id !== plan.id);
  stored.push({ plan, importedAt: new Date().toISOString() });
  await set('plans', stored, db);
}

export async function deletePlan(id: string): Promise<void> {
  const stored = ((await get<StoredPlan[]>('plans', db)) ?? []).filter((p) => p.plan.id !== id);
  await set('plans', stored, db);
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await get<Settings>('settings', db)) ?? {}) };
}

export const saveSettings = (s: Settings) => set('settings', s, db);

export async function loadLogs(): Promise<LogEntry[]> {
  return (await get<LogEntry[]>('logs', db)) ?? [];
}

export async function addLog(entry: LogEntry): Promise<void> {
  const logs = (await loadLogs()).filter((l) => l.id !== entry.id);
  logs.push(entry);
  await set('logs', logs, db);
}

export async function deleteLog(id: string): Promise<void> {
  await set('logs', (await loadLogs()).filter((l) => l.id !== id), db);
}

export const loadRun = () => get<RunState>('run', db);
export const saveRun = (run: RunState) => set('run', run, db);
export const clearRun = () => del('run', db);

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'training-player',
    version: 1,
    exportedAt: new Date().toISOString(),
    plans: (await get<StoredPlan[]>('plans', db)) ?? [],
    logs: await loadLogs(),
    settings: await loadSettings(),
  };
}

export async function restoreBackup(b: Backup): Promise<void> {
  if (b.app !== 'training-player' || b.version !== 1) throw new Error('Not a Training Player backup');
  await set('plans', b.plans, db);
  await set('logs', b.logs, db);
  await set('settings', { ...DEFAULT_SETTINGS, ...b.settings }, db);
}
