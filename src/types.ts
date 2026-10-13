// TypeScript mirror of spec/training-plan.schema.json (specVersion 1).
// Keep both in sync: the schema is the source of truth for plan authors.

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** A value that grows week by week: base at fromWeek, + perWeek each week after, clamped to max. */
export interface Progression {
  base: number;
  fromWeek: number;
  perWeek: number;
  max?: number;
  min?: number;
}

export type Num = number | Progression;

export type Media =
  | { type: 'image'; src: string; alt?: string }
  | { type: 'youtube'; url: string; start?: number; title?: string }
  | { type: 'link'; url: string; title?: string };

export interface Alternative {
  exercise: string;
  when?: string;
}

export interface Exercise {
  name: string;
  instructions?: string;
  cues?: string[];
  equipment?: string[];
  media?: Media[];
  alternatives?: Alternative[];
}

export type LoadPlacement = 'back' | 'thighs' | 'hips' | 'hands' | 'front';

export interface Load {
  kg: Num;
  kgMax?: number;
  placement?: LoadPlacement;
  /** Equipment id that provides the load, e.g. "backpack". */
  equipment?: string;
}

export interface Item {
  exercise: string;
  /** Overrides the exercise name in the player, e.g. "Fast chair step-ups". */
  label?: string;
  reps?: Num;
  /** Seconds. */
  duration?: Num;
  perSide?: boolean;
  tempo?: string;
  intensity?: string;
  load?: Load;
  /** Overrides the exercise's equipment for this item. */
  equipment?: string[];
  /** 1-based round numbers in which this item is performed. */
  onlyRounds?: number[];
  note?: string;
}

export interface Choice {
  choice: Item[];
  label?: string;
}

export type BlockKind = 'warmup' | 'main' | 'finish' | 'cooldown';

export interface Block {
  title: string;
  kind?: BlockKind;
  rounds?: Num;
  /** Seconds of rest after each round except the last. */
  restBetweenRounds?: Num;
  /** Seconds of rest between items inside a round. */
  restBetweenItems?: Num;
  note?: string;
  items: (Item | Choice)[];
}

export interface Session {
  environment: string;
  phases?: string[];
  weeks?: number[];
  note?: string;
  blocks: (string | Block)[];
}

export type Autofill = 'roundsCompleted' | 'maxLoadKg' | 'durationMinutes' | { maxDuration: string };

export interface LogField {
  id: string;
  label: string;
  type: 'number' | 'rpe' | 'boolean' | 'text';
  unit?: string;
  target?: [number, number];
  /** Only ask for this field in these environments. */
  environments?: string[];
  autofill?: Autofill;
}

export interface Day {
  weekday: Weekday;
  title: string;
  subtitle?: string;
  why?: string;
  log?: LogField[];
  sessions: Session[];
}

export interface Phase {
  id: string;
  name: string;
  weeks: [number, number];
  focus?: string;
  notes?: string;
}

export interface Environment {
  id: string;
  name: string;
  description?: string;
  equipment: string[];
}

export interface EquipmentDef {
  name: string;
  description?: string;
}

export interface Plan {
  specVersion: 1;
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  startDate: string;
  equipment?: Record<string, EquipmentDef>;
  environments: Environment[];
  exercises: Record<string, Exercise>;
  blocks?: Record<string, Block>;
  phases: Phase[];
  days: Day[];
  notes?: string[];
}

export function isChoice(x: Item | Choice): x is Choice {
  return (x as Choice).choice !== undefined;
}
