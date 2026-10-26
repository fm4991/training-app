// Pure state machine for a session in progress. Times are epoch ms (Date.now()),
// so a persisted run resumes correctly after the app was suspended or killed.
import type { LogField, Plan, Weekday } from '../types';
import type { BuildOptions, Step } from './steps';

export type ClockPhase = 'idle' | 'prep' | 'running' | 'paused' | 'finished';

export interface RunState {
  id: string;
  planId: string;
  week: number;
  weekday: Weekday;
  environment: string;
  options: BuildOptions;
  startedAt: number;
  index: number;
  clock: {
    phase: ClockPhase;
    /** prep: when the prep countdown ends. running: when the current segment started. */
    at: number;
    /** ms accumulated before the current running segment. */
    accumulated: number;
  };
  /** Seconds actually spent on each timed exercise step, by step index. */
  elapsed: Record<number, number>;
  /** Step indexes that were finished (Next pressed or timer ran out). */
  completed: number[];
}

export interface RunSettings {
  autoAdvance: boolean;
  prepSeconds: number;
}

const isTimed = (s: Step | undefined) => s?.duration !== undefined;

export function createRun(
  init: Pick<RunState, 'planId' | 'week' | 'weekday' | 'environment' | 'options'>,
  steps: Step[],
  settings: RunSettings,
  now: number,
): RunState {
  const run: RunState = {
    ...init,
    id: `${now}`,
    startedAt: now,
    index: 0,
    clock: { phase: 'idle', at: now, accumulated: 0 },
    elapsed: {},
    completed: [],
  };
  return enterStep(run, steps, 0, false, settings, now);
}

function enterStep(run: RunState, steps: Step[], index: number, auto: boolean, settings: RunSettings, now: number): RunState {
  const step = steps[index];
  let clock: RunState['clock'];
  if (!isTimed(step)) clock = { phase: 'idle', at: now, accumulated: 0 };
  // A rest already gives time to get ready; everything else (manual moves, exercise -> exercise) gets prep.
  else if (step.kind === 'exercise' && settings.prepSeconds > 0 && !(auto && steps[run.index]?.kind === 'rest')) {
    clock = { phase: 'prep', at: now + settings.prepSeconds * 1000, accumulated: 0 };
  } else clock = { phase: 'running', at: now, accumulated: 0 };
  return { ...run, index, clock };
}

/** Milliseconds elapsed on the current step's clock. */
export function elapsedMs(run: RunState, now: number): number {
  const { phase, at, accumulated } = run.clock;
  return phase === 'running' ? accumulated + Math.max(0, now - at) : accumulated;
}

export function remainingMs(run: RunState, step: Step | undefined, now: number): number | undefined {
  if (step?.duration === undefined) return undefined;
  if (run.clock.phase === 'prep') return step.duration * 1000;
  return Math.max(0, step.duration * 1000 - elapsedMs(run, now));
}

export function prepRemainingMs(run: RunState, now: number): number {
  return run.clock.phase === 'prep' ? Math.max(0, run.clock.at - now) : 0;
}

function recordCurrent(run: RunState, steps: Step[], now: number): RunState {
  const step = steps[run.index];
  const completed = run.completed.includes(run.index) ? run.completed : [...run.completed, run.index];
  if (step?.kind !== 'exercise' || !isTimed(step) || run.clock.phase === 'prep') return { ...run, completed };
  const secs = Math.round(Math.min(elapsedMs(run, now), step.duration! * 1000) / 1000);
  return { ...run, completed, elapsed: { ...run.elapsed, [run.index]: secs } };
}

/** Move to the next step. Returns index === steps.length when the session is over. */
export function next(run: RunState, steps: Step[], settings: RunSettings, now: number, auto = false): RunState {
  const recorded = recordCurrent(run, steps, now);
  const index = run.index + 1;
  if (index >= steps.length) return { ...recorded, index, clock: { phase: 'idle', at: now, accumulated: 0 } };
  return enterStep(recorded, steps, index, auto, settings, now);
}

export function back(run: RunState, steps: Step[], settings: RunSettings, now: number): RunState {
  return enterStep(run, steps, Math.max(0, run.index - 1), false, settings, now);
}

export function jumpTo(run: RunState, steps: Step[], index: number, settings: RunSettings, now: number): RunState {
  return enterStep(run, steps, Math.min(Math.max(0, index), steps.length - 1), false, settings, now);
}

export function togglePause(run: RunState, now: number): RunState {
  const { phase } = run.clock;
  if (phase === 'running') return { ...run, clock: { phase: 'paused', at: now, accumulated: elapsedMs(run, now) } };
  if (phase === 'paused') return { ...run, clock: { ...run.clock, phase: 'running', at: now } };
  if (phase === 'prep') return { ...run, clock: { phase: 'running', at: now, accumulated: 0 } };
  return run;
}

/** Adds seconds to the current timed step by moving its clock back. */
export function addTime(run: RunState, seconds: number): RunState {
  return { ...run, clock: { ...run.clock, accumulated: run.clock.accumulated - seconds * 1000 } };
}

export type TickEvent = 'none' | 'prep-done' | 'finished' | 'advance';

/**
 * Advances the clock to `now`: ends prep, and handles a step whose time ran out.
 * Rest always auto-advances; exercises only when autoAdvance is on.
 */
export function tick(run: RunState, steps: Step[], settings: RunSettings, now: number): { run: RunState; event: TickEvent } {
  const step = steps[run.index];
  if (!isTimed(step)) return { run, event: 'none' };
  if (run.clock.phase === 'prep' && now >= run.clock.at) {
    return { run: { ...run, clock: { phase: 'running', at: run.clock.at, accumulated: 0 } }, event: 'prep-done' };
  }
  if (run.clock.phase === 'running' && remainingMs(run, step, now) === 0) {
    if (step.kind === 'rest' || settings.autoAdvance) {
      // Start the next step at the exact moment this one ended, not at `now`.
      const endedAt = run.clock.at + step.duration! * 1000 - run.clock.accumulated;
      return { run: next(run, steps, settings, Math.min(now, endedAt), true), event: 'advance' };
    }
    return { run: { ...recordCurrent(run, steps, now), clock: { phase: 'finished', at: now, accumulated: step.duration! * 1000 } }, event: 'finished' };
  }
  return { run, event: 'none' };
}

export function isDone(run: RunState, steps: Step[]): boolean {
  return run.index >= steps.length;
}

/** Values to pre-fill the log form with, derived from what happened in the session. */
export function autofill(fields: LogField[], plan: Plan, steps: Step[], run: RunState, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  const done = new Set(run.completed);
  for (const f of fields) {
    const a = f.autofill;
    if (!a) continue;
    if (a === 'durationMinutes') out[f.id] = Math.round((now - run.startedAt) / 60000);
    else if (a === 'maxLoadKg') {
      const kgs = steps.filter((s) => s.load).map((s) => s.load!.kg);
      if (kgs.length) out[f.id] = Math.max(...kgs);
    } else if (a === 'roundsCompleted') {
      const rounds = roundsCompleted(steps, done);
      if (rounds !== undefined) out[f.id] = rounds;
    } else if (plan.exercises[a.maxDuration]) {
      const secs = steps
        .map((s, i) => (s.exerciseId === a.maxDuration ? run.elapsed[i] : undefined))
        .filter((x): x is number => x !== undefined);
      if (secs.length) out[f.id] = Math.max(...secs);
    }
  }
  return out;
}

/** Fully completed rounds of the main block with the most rounds. */
export function roundsCompleted(steps: Step[], done: Set<number>): number | undefined {
  const main = steps.filter((s) => s.blockKind === 'main');
  if (!main.length) return undefined;
  const blockIndex = main.reduce((best, s) => (s.rounds > best.rounds ? s : best)).blockIndex;
  let count = 0;
  const rounds = steps.find((s) => s.blockIndex === blockIndex)!.rounds;
  for (let r = 1; r <= rounds; r++) {
    const idx = steps.flatMap((s, i) => (s.blockIndex === blockIndex && s.round === r && s.kind === 'exercise' ? [i] : []));
    if (idx.every((i) => done.has(i))) count++;
  }
  return count;
}
