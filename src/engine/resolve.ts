import type { Block, Day, Num, Phase, Plan, Session, Weekday } from '../types';
import { WEEKDAYS } from '../types';

export type PlanStatus = 'before' | 'active' | 'after';

export interface PlanPosition {
  status: PlanStatus;
  /** 1-based week number; may be <1 or > totalWeeks when outside the plan. */
  week: number;
  weekday: Weekday;
  phase?: Phase;
  totalWeeks: number;
  /** Days until the plan starts (status "before"). */
  daysUntilStart: number;
}

const DAY_MS = 86_400_000;

/** Parses YYYY-MM-DD as a local date at midnight. */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function weekdayOf(d: Date): Weekday {
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

/** Whole local days between two dates, robust against DST shifts. */
function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function totalWeeks(plan: Plan): number {
  return Math.max(...plan.phases.map((p) => p.weeks[1]));
}

export function phaseForWeek(plan: Plan, week: number): Phase | undefined {
  return plan.phases.find((p) => week >= p.weeks[0] && week <= p.weeks[1]);
}

export function positionOn(plan: Plan, date: Date): PlanPosition {
  const days = daysBetween(parseLocalDate(plan.startDate), date);
  const week = Math.floor(days / 7) + 1;
  const total = totalWeeks(plan);
  const status: PlanStatus = days < 0 ? 'before' : week > total ? 'after' : 'active';
  return {
    status,
    week,
    weekday: weekdayOf(date),
    phase: status === 'active' ? phaseForWeek(plan, week) : undefined,
    totalWeeks: total,
    daysUntilStart: Math.max(0, -days),
  };
}

/** Date of a given week + weekday in the plan. */
export function dateOf(plan: Plan, week: number, weekday: Weekday): Date {
  const start = parseLocalDate(plan.startDate);
  const offset = (week - 1) * 7 + WEEKDAYS.indexOf(weekday) - WEEKDAYS.indexOf(weekdayOf(start));
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
}

export function dayFor(plan: Plan, weekday: Weekday): Day | undefined {
  return plan.days.find((d) => d.weekday === weekday);
}

export function findSession(plan: Plan, day: Day, week: number, environment: string): Session | undefined {
  const phase = phaseForWeek(plan, week);
  const forEnv = day.sessions.filter((s) => s.environment === environment);
  // A session pinned to explicit weeks beats a phase-wide one.
  return (
    forEnv.find((s) => s.weeks?.includes(week)) ??
    forEnv.find((s) => !s.weeks && (!s.phases || (phase && s.phases.includes(phase.id))))
  );
}

export function resolveBlocks(plan: Plan, session: Session): Block[] {
  return session.blocks.map((b) => {
    if (typeof b !== 'string') return b;
    const block = plan.blocks?.[b];
    if (!block) throw new Error(`Unknown block "${b}"`);
    return block;
  });
}

export function resolveNum(n: Num | undefined, week: number): number | undefined {
  if (n === undefined) return undefined;
  if (typeof n === 'number') return n;
  let v = n.base + n.perWeek * Math.max(0, week - n.fromWeek);
  if (n.max !== undefined) v = Math.min(v, n.max);
  if (n.min !== undefined) v = Math.max(v, n.min);
  return v;
}

/** Equipment a session needs, derived from its items and loads. */
export function sessionEquipment(plan: Plan, session: Session): string[] {
  const out = new Set<string>();
  for (const block of resolveBlocks(plan, session)) {
    for (const entry of block.items) {
      const items = 'choice' in entry ? entry.choice : [entry];
      for (const item of items) {
        const eq = item.equipment ?? plan.exercises[item.exercise]?.equipment ?? [];
        eq.forEach((e) => out.add(e));
        if (item.load?.equipment) out.add(item.load.equipment);
      }
    }
  }
  return [...out];
}
