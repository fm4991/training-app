import { describe, expect, it } from 'vitest';
import heliski from '../../plans/heliski.json';
import type { Plan, Weekday } from '../types';
import { dateOf, dayFor, findSession, positionOn, resolveNum, sessionEquipment } from './resolve';
import { buildSteps, type Step } from './steps';
import { parseAndValidate, validatePlan } from './validate';

const plan = heliski as unknown as Plan;
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

function steps(weekday: Weekday, week: number, env: string, opts = {}): Step[] {
  const session = findSession(plan, dayFor(plan, weekday)!, week, env);
  if (!session) throw new Error(`no session ${weekday} w${week} ${env}`);
  return buildSteps(plan, session, week, opts);
}

const block = (s: Step[], title: string) => s.filter((x) => x.blockTitle === title);
const names = (s: Step[]) => s.map((x) => (x.kind === 'rest' ? `rest ${x.duration}` : x.exerciseId + (x.side ? `:${x.side}` : '')));

describe('positionOn', () => {
  it('starts week 1 on the start date', () => {
    const p = positionOn(plan, local(2026, 9, 14));
    expect(p).toMatchObject({ status: 'active', week: 1, weekday: 'mon' });
    expect(p.phase?.id).toBe('p1');
  });

  it('handles phase boundaries', () => {
    expect(positionOn(plan, local(2026, 10, 11)).phase?.id).toBe('p1'); // Sun of week 4
    expect(positionOn(plan, local(2026, 10, 12))).toMatchObject({ week: 5, weekday: 'mon' });
    expect(positionOn(plan, local(2026, 10, 12)).phase?.id).toBe('p2');
    expect(positionOn(plan, local(2026, 11, 23)).phase?.id).toBe('p3');
    expect(positionOn(plan, local(2027, 1, 4)).phase?.id).toBe('p4');
  });

  it('is DST safe (Europe switches on 25 Oct 2026)', () => {
    expect(positionOn(plan, local(2026, 10, 26))).toMatchObject({ week: 7, weekday: 'mon' });
  });

  it('reports before/after the plan', () => {
    expect(positionOn(plan, local(2026, 9, 10))).toMatchObject({ status: 'before', daysUntilStart: 4 });
    expect(positionOn(plan, local(2027, 1, 18))).toMatchObject({ status: 'after', week: 19 });
  });

  it('dateOf is the inverse', () => {
    expect(dateOf(plan, 7, 'wed')).toEqual(local(2026, 10, 28));
  });
});

describe('findSession', () => {
  it('returns nothing on weekends', () => {
    expect(dayFor(plan, 'sat')).toBeUndefined();
  });

  it('picks the session per environment', () => {
    const tue = dayFor(plan, 'tue')!;
    expect(sessionEquipment(plan, findSession(plan, tue, 1, 'home')!)).toContain('rowerg');
    expect(sessionEquipment(plan, findSession(plan, tue, 1, 'travel')!)).not.toContain('rowerg');
  });

  it('every weekday has a session for every week and environment', () => {
    for (const day of plan.days) {
      for (let w = 1; w <= 18; w++) {
        for (const env of ['home', 'travel']) expect(findSession(plan, day, w, env), `${day.weekday} w${w} ${env}`).toBeDefined();
      }
    }
  });
});

describe('resolveNum', () => {
  const wallSit = { base: 60, fromWeek: 5, perWeek: 15, max: 120 };
  it('applies weekly progression with a cap', () => {
    expect(resolveNum(wallSit, 5)).toBe(60);
    expect(resolveNum(wallSit, 7)).toBe(90);
    expect(resolveNum(wallSit, 10)).toBe(120);
    expect(resolveNum(wallSit, 2)).toBe(60);
  });
});

describe('buildSteps', () => {
  it('Mon P2 home alternates bridge (rounds 1, 3) and calf raise (rounds 2, 4)', () => {
    const main = block(steps('mon', 6, 'home'), 'Main').filter((s) => s.kind === 'exercise');
    const byRound = (r: number) => main.filter((s) => s.round === r).map((s) => s.exerciseId);
    expect(byRound(1)).toContain('single-leg-glute-bridge');
    expect(byRound(1)).not.toContain('single-leg-calf-raise');
    expect(byRound(2)).toContain('single-leg-calf-raise');
    expect(byRound(2)).not.toContain('single-leg-glute-bridge');
    expect(main[0].load).toEqual({ kg: 10, kgMax: 12, placement: 'back' });
    expect(main[0]).toMatchObject({ reps: 8, perSide: true });
  });

  it('Wed P2 wall sit is 90 s in week 7 and only in rounds 1–3', () => {
    const wall = steps('wed', 7, 'travel').filter((s) => s.exerciseId === 'wall-sit' && s.blockTitle === 'Main');
    expect(wall.map((s) => s.round)).toEqual([1, 2, 3]);
    expect(wall.every((s) => s.duration === 90)).toBe(true);
  });

  it('Fri P1: 3 rounds × 6 timed items, no rest between items, 90 s between rounds', () => {
    const circuit = block(steps('fri', 2, 'travel'), 'Circuit');
    expect(circuit.filter((s) => s.kind === 'exercise')).toHaveLength(18);
    expect(circuit.filter((s) => s.kind === 'rest').map((s) => s.duration)).toEqual([90, 90]);
    expect(circuit.filter((s) => s.kind === 'exercise').every((s) => s.duration === 45)).toBe(true);
    expect(circuit.at(-1)?.kind).toBe('exercise'); // no rest after the last round
  });

  it('Tue home P1: 6 × (2 min hard → 1 min easy)', () => {
    const iv = block(steps('tue', 1, 'home'), 'RowErg intervals');
    expect(iv).toHaveLength(12);
    expect(iv.map((s) => `${s.intensity} ${s.duration}`).slice(0, 2)).toEqual(['hard 120', 'easy 60']);
  });

  it('splits timed per-side items into left and right steps', () => {
    const finish = block(steps('mon', 1, 'travel'), 'Finish');
    expect(names(finish)).toEqual(['plank', 'side-plank:left', 'side-plank:right', 'dead-bug', 'deep-squat-hold']);
  });

  it('honours choices and swaps', () => {
    const def = steps('wed', 12, 'travel').filter((s) => s.itemKey === '1.1');
    expect(def[0]).toMatchObject({ exerciseId: 'wall-sit', duration: 180 });
    const alt = steps('wed', 12, 'travel', { choices: { '1.1': 1 } }).filter((s) => s.itemKey === '1.1');
    expect(names(alt.slice(0, 2))).toEqual(['single-leg-wall-sit:left', 'single-leg-wall-sit:right']);

    const swapped = steps('fri', 1, 'home', { swaps: { '1.4': 'mountain-climber' } }).filter((s) => s.itemKey === '1.4');
    expect(swapped.every((s) => s.exerciseId === 'mountain-climber' && s.name === 'Mountain climbers')).toBe(true);
  });

  it('adds rest between items when configured', () => {
    const p: Plan = {
      ...plan,
      blocks: {},
      days: [],
    };
    const s = buildSteps(
      p,
      {
        environment: 'home',
        blocks: [{ title: 'B', rounds: 2, restBetweenItems: 15, restBetweenRounds: 60, items: [{ exercise: 'plank', duration: 30 }, { exercise: 'dead-bug', reps: 10 }] }],
      },
      1,
    );
    expect(names(s)).toEqual(['plank', 'rest 15', 'dead-bug', 'rest 60', 'plank', 'rest 15', 'dead-bug']);
  });
});

describe('validatePlan', () => {
  it('accepts the heliski plan without warnings', () => {
    const r = validatePlan(heliski);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('reports schema errors with paths', () => {
    const broken = structuredClone(heliski) as any;
    broken.days[0].sessions[0].blocks[1].items[0].reps = 'eight';
    delete broken.title;
    broken.exercises['plank'].colour = 'red';
    const r = validatePlan(broken);
    expect(r.plan).toBeUndefined();
    const paths = r.errors.map((e) => `${e.path} ${e.message}`);
    expect(paths).toContain("/ must have required property 'title'");
    expect(paths).toContain('/exercises/plank unknown property "colour"');
    expect(paths.some((p) => p.startsWith('/days/0/sessions/0/blocks/1'))).toBe(true);
  });

  it('reports broken references', () => {
    const broken = structuredClone(heliski) as any;
    broken.days[0].sessions[0].blocks[0] = 'no-such-block';
    broken.days[1].sessions[0].blocks[1].items[0].exercise = 'nope';
    const msgs = validatePlan(broken).errors.map((e) => e.message);
    expect(msgs).toContain('unknown block "no-such-block"');
    expect(msgs).toContain('unknown exercise "nope"');
  });

  it('warns when a travel session needs home equipment', () => {
    const p = structuredClone(heliski) as any;
    p.days[1].sessions[0].blocks[1].items[0].exercise = 'rowerg';
    expect(validatePlan(p).warnings.map((w) => w.message)).toContain('tue: needs rowerg, which "travel" does not have');
  });

  it('rejects invalid JSON text', () => {
    expect(parseAndValidate('{ nope').errors[0].message).toMatch(/not valid JSON/);
  });
});
