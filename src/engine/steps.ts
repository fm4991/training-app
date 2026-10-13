import type { BlockKind, Item, LoadPlacement, Plan, Session } from '../types';
import { isChoice } from '../types';
import { resolveBlocks, resolveNum } from './resolve';

export interface StepLoad {
  kg: number;
  kgMax?: number;
  placement?: LoadPlacement;
}

export interface Step {
  kind: 'exercise' | 'rest';
  blockIndex: number;
  blockTitle: string;
  blockKind: BlockKind;
  round: number;
  rounds: number;
  /** "<blockIndex>.<itemIndex>", stable across rounds; used for choices and swaps. */
  itemKey?: string;
  exerciseId?: string;
  name: string;
  reps?: number;
  /** For reps: the count applies to each side. */
  perSide?: boolean;
  /** For timed per-side items, which side this step is. */
  side?: 'left' | 'right';
  /** Seconds. Timed steps count down; untimed steps wait for a tap. */
  duration?: number;
  tempo?: string;
  intensity?: string;
  note?: string;
  load?: StepLoad;
}

export interface BuildOptions {
  /** itemKey -> index into the choice's options. Defaults to 0. */
  choices?: Record<string, number>;
  /** itemKey -> replacement exercise id (from the exercise's alternatives). */
  swaps?: Record<string, string>;
}

function itemSteps(
  plan: Plan,
  item: Item,
  week: number,
  base: Omit<Step, 'kind' | 'name'>,
  swap: string | undefined,
): Step[] {
  const exerciseId = swap ?? item.exercise;
  const exercise = plan.exercises[exerciseId];
  const kg = resolveNum(item.load?.kg, week);
  const step: Step = {
    ...base,
    kind: 'exercise',
    exerciseId,
    // An item label describes the original exercise, so drop it when swapped.
    name: (!swap && item.label) || exercise?.name || exerciseId,
    reps: resolveNum(item.reps, week),
    duration: resolveNum(item.duration, week),
    tempo: item.tempo,
    intensity: item.intensity,
    note: item.note,
    load: item.load && kg ? { kg, kgMax: item.load.kgMax, placement: item.load.placement } : undefined,
  };
  if (item.perSide && step.duration !== undefined) {
    return [
      { ...step, side: 'left' },
      { ...step, side: 'right' },
    ];
  }
  if (item.perSide) step.perSide = true;
  return [step];
}

function restStep(base: Omit<Step, 'kind' | 'name'>, seconds: number, name: string): Step {
  return { ...base, kind: 'rest', name, duration: seconds };
}

/** Flattens a session into the linear list of steps the player walks through. */
export function buildSteps(plan: Plan, session: Session, week: number, opts: BuildOptions = {}): Step[] {
  const steps: Step[] = [];
  resolveBlocks(plan, session).forEach((block, blockIndex) => {
    const rounds = Math.max(1, resolveNum(block.rounds, week) ?? 1);
    const restRounds = resolveNum(block.restBetweenRounds, week) ?? 0;
    const restItems = resolveNum(block.restBetweenItems, week) ?? 0;
    const blockKind: BlockKind = block.kind ?? 'main';

    for (let round = 1; round <= rounds; round++) {
      const base = { blockIndex, blockTitle: block.title, blockKind, round, rounds };
      const inRound: Step[][] = [];
      block.items.forEach((entry, itemIndex) => {
        const itemKey = `${blockIndex}.${itemIndex}`;
        const item = isChoice(entry) ? entry.choice[opts.choices?.[itemKey] ?? 0] ?? entry.choice[0] : entry;
        if (item.onlyRounds && !item.onlyRounds.includes(round)) return;
        inRound.push(itemSteps(plan, item, week, { ...base, itemKey }, opts.swaps?.[itemKey]));
      });
      inRound.forEach((group, i) => {
        steps.push(...group);
        if (restItems > 0 && i < inRound.length - 1) steps.push(restStep(base, restItems, 'Rest'));
      });
      if (restRounds > 0 && round < rounds) steps.push(restStep(base, restRounds, 'Rest between rounds'));
    }
  });
  return steps;
}

/** Total planned seconds, counting untimed steps with a rough estimate. */
export function estimateSeconds(steps: Step[], secondsPerRep = 3): number {
  return steps.reduce((sum, s) => {
    if (s.duration !== undefined) return sum + s.duration;
    return sum + (s.reps ?? 10) * secondsPerRep * (s.perSide ? 2 : 1);
  }, 0);
}
