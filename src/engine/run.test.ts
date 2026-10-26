import { describe, expect, it } from 'vitest';
import heliski from '../../plans/heliski.json';
import type { Plan } from '../types';
import { dayFor, findSession } from './resolve';
import { addTime, autofill, back, createRun, next, remainingMs, tick, togglePause, type RunState } from './run';
import { buildSteps, type Step } from './steps';

const plan = heliski as unknown as Plan;
const settings = { autoAdvance: true, prepSeconds: 5 };
const T0 = 1_000_000;

function fridayCircuit() {
  const day = dayFor(plan, 'fri')!;
  const steps = buildSteps(plan, findSession(plan, day, 1, 'travel')!, 1);
  const run = createRun({ planId: plan.id, week: 1, weekday: 'fri', environment: 'travel', options: {} }, steps, settings, T0);
  return { day, steps, run };
}

/** Runs tick until nothing changes, like the player does after a resume. */
function settle(run: RunState, steps: Step[], now: number, s = settings) {
  for (;;) {
    const r = tick(run, steps, s, now);
    if (r.event === 'none') return run;
    run = r.run;
  }
}

describe('run state machine', () => {
  it('a manually started timed exercise gets a prep countdown, then runs', () => {
    const { steps, run } = fridayCircuit();
    expect(steps[0].exerciseId).toBe('jumping-jacks');
    expect(run.clock.phase).toBe('prep');
    const r = tick(run, steps, settings, T0 + 5000);
    expect(r.event).toBe('prep-done');
    expect(remainingMs(r.run, steps[0], T0 + 15_000)).toBe(50_000);
  });

  it('auto-advances exercise -> exercise with prep and keeps exact timing across steps', () => {
    const { steps } = fridayCircuit();
    const circuitStart = steps.findIndex((s) => s.blockTitle === 'Circuit');
    let run: RunState = { ...fridayCircuit().run, index: circuitStart, clock: { phase: 'running', at: T0, accumulated: 0 } };
    // Jump squats 45, prep 5, wall sit 45, prep 5, then lateral hops.
    run = settle(run, steps, T0 + 47_000);
    expect(steps[run.index].exerciseId).toBe('wall-sit');
    expect(run.clock.phase).toBe('prep');
    run = settle(run, steps, T0 + 110_000);
    expect(steps[run.index].exerciseId).toBe('lateral-hop');
    expect(run.clock.phase).toBe('running');
    expect(remainingMs(run, steps[run.index], T0 + 110_000)).toBe(35_000);
    expect(run.elapsed[circuitStart + 1]).toBe(45);
  });

  it('auto-advances rest -> exercise without prep', () => {
    const { steps, run } = fridayCircuit();
    const rest = steps.findIndex((s, i) => s.kind === 'rest' && steps[i + 1]?.kind === 'exercise' && steps[i + 1].duration !== undefined);
    const r = settle({ ...run, index: rest, clock: { phase: 'running', at: T0, accumulated: 0 } }, steps, T0 + steps[rest].duration! * 1000);
    expect(r.index).toBe(rest + 1);
    expect(r.clock.phase).toBe('running');
  });

  it('without auto-advance a finished exercise waits for Next', () => {
    const { steps, run } = fridayCircuit();
    const s = { ...settings, autoAdvance: false };
    const r = settle(tick(run, steps, s, T0 + 5000).run, steps, T0 + 70_000, s);
    expect(r.index).toBe(0);
    expect(r.clock.phase).toBe('finished');
  });

  it('records the actual time when a hold is stopped early (wall sit failure)', () => {
    const { steps, run } = fridayCircuit();
    const wall = steps.findIndex((s) => s.exerciseId === 'wall-sit');
    let r: RunState = { ...run, index: wall, clock: { phase: 'running', at: T0, accumulated: 0 } };
    r = next(r, steps, settings, T0 + 32_400);
    expect(r.elapsed[wall]).toBe(32);
    expect(r.index).toBe(wall + 1);
    expect(r.clock.phase).toBe('prep'); // manual Next -> prep before the next timed exercise
  });

  it('pause stops the clock, +time extends rest', () => {
    const { steps, run } = fridayCircuit();
    let r = tick(run, steps, settings, T0 + 5000).run;
    r = togglePause(r, T0 + 15_000);
    expect(remainingMs(r, steps[0], T0 + 60_000)).toBe(50_000);
    r = togglePause(r, T0 + 60_000);
    r = addTime(r, 15);
    expect(remainingMs(r, steps[0], T0 + 60_000)).toBe(65_000);
  });

  it('back re-enters the previous step', () => {
    const { steps, run } = fridayCircuit();
    const r = back(next(run, steps, settings, T0), steps, settings, T0 + 1000);
    expect(r.index).toBe(0);
  });

  it('autofills rounds completed for the log', () => {
    const { day, steps, run } = fridayCircuit();
    const circuit = steps.flatMap((s, i) => (s.blockTitle === 'Circuit' && s.round <= 2 ? [i] : []));
    const values = autofill(day.log!, plan, steps, { ...run, completed: circuit }, T0);
    expect(values.rounds).toBe(2);
  });

  it('autofills best wall-sit time and backpack kg', () => {
    const day = dayFor(plan, 'wed')!;
    const steps = buildSteps(plan, findSession(plan, day, 7, 'home')!, 7);
    const walls = steps.flatMap((s, i) => (s.exerciseId === 'wall-sit' ? [i] : []));
    const run = createRun({ planId: plan.id, week: 7, weekday: 'wed', environment: 'home', options: {} }, steps, settings, T0);
    const values = autofill(day.log!, plan, steps, { ...run, elapsed: { [walls[0]]: 90, [walls[1]]: 84 } }, T0);
    expect(values).toEqual({ wallsit: 90, kg: 8 });
  });
});
