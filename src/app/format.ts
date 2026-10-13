import type { Step, StepLoad } from '../engine/steps';
import type { Weekday } from '../types';

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** 75 -> "1:15", 45 -> "0:45". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 45 -> "45 s", 120 -> "2 min", 90 -> "1:30 min". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${clock(seconds)} min`;
}

export function loadLabel(load: StepLoad): string {
  const kg = load.kgMax ? `${load.kg}–${load.kgMax} kg` : `${load.kg} kg`;
  return load.placement ? `${kg} on ${load.placement}` : kg;
}

/** Short target, e.g. "8 / side", "45 s", "10 reps". */
export function target(step: Step): string {
  if (step.duration !== undefined) return duration(step.duration);
  if (step.reps !== undefined) return step.perSide ? `${step.reps} / side` : `${step.reps}×`;
  return '';
}

export function sideLabel(step: Step): string | undefined {
  return step.side === 'left' ? 'Left' : step.side === 'right' ? 'Right' : undefined;
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
