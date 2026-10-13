import Ajv, { type ErrorObject } from 'ajv';
import schema from '../../spec/training-plan.schema.json';
import { isChoice, type Block, type Item, type Plan } from '../types';
import { sessionEquipment } from './resolve';

export interface Issue {
  path: string;
  message: string;
}

export interface ValidationResult {
  plan?: Plan;
  errors: Issue[];
  warnings: Issue[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function formatAjvErrors(errors: ErrorObject[]): Issue[] {
  // `oneOf`/`if` branches produce a lot of noise; keep the most specific messages.
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const e of errors) {
    if (e.keyword === 'oneOf' || e.keyword === 'if') continue;
    let message = e.message ?? 'invalid';
    if (e.keyword === 'additionalProperties') {
      message = `unknown property "${(e.params as { additionalProperty: string }).additionalProperty}"`;
    } else if (e.keyword === 'enum') {
      message = `must be one of: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')}`;
    } else if (e.keyword === 'not') {
      message = 'must not have both "reps" and "duration"';
    }
    const path = e.instancePath || '/';
    const key = `${path}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, message });
  }
  return out;
}

/** Cross-reference checks the JSON Schema cannot express. */
function checkReferences(plan: Plan): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const envIds = new Set(plan.environments.map((e) => e.id));
  const phaseIds = new Set(plan.phases.map((p) => p.id));
  const exerciseIds = new Set(Object.keys(plan.exercises));
  const blockIds = new Set(Object.keys(plan.blocks ?? {}));
  const equipmentIds = plan.equipment ? new Set(Object.keys(plan.equipment)) : undefined;

  const checkEquipment = (ids: string[] | undefined, path: string) => {
    if (!ids || !equipmentIds) return;
    ids.forEach((id, i) => {
      if (!equipmentIds.has(id)) errors.push({ path: `${path}/${i}`, message: `unknown equipment "${id}"` });
    });
  };

  plan.environments.forEach((env, i) => checkEquipment(env.equipment, `/environments/${i}/equipment`));

  for (const [id, ex] of Object.entries(plan.exercises)) {
    checkEquipment(ex.equipment, `/exercises/${id}/equipment`);
    ex.alternatives?.forEach((alt, i) => {
      if (!exerciseIds.has(alt.exercise)) {
        errors.push({ path: `/exercises/${id}/alternatives/${i}`, message: `unknown exercise "${alt.exercise}"` });
      }
    });
  }

  const checkItem = (item: Item, path: string) => {
    if (!exerciseIds.has(item.exercise)) errors.push({ path, message: `unknown exercise "${item.exercise}"` });
    checkEquipment(item.equipment, `${path}/equipment`);
    if (item.load?.equipment) checkEquipment([item.load.equipment], `${path}/load/equipment`);
  };

  const checkBlock = (block: Block, path: string) => {
    block.items.forEach((it, i) => {
      if (isChoice(it)) it.choice.forEach((c, j) => checkItem(c, `${path}/items/${i}/choice/${j}`));
      else checkItem(it, `${path}/items/${i}`);
    });
  };

  for (const [id, block] of Object.entries(plan.blocks ?? {})) checkBlock(block, `/blocks/${id}`);

  const lastWeek = Math.max(...plan.phases.map((p) => p.weeks[1]));
  plan.phases.forEach((p, i) => {
    if (p.weeks[0] > p.weeks[1]) errors.push({ path: `/phases/${i}/weeks`, message: 'first week is after last week' });
  });
  for (let w = 1; w <= lastWeek; w++) {
    const matches = plan.phases.filter((p) => w >= p.weeks[0] && w <= p.weeks[1]);
    if (matches.length === 0) warnings.push({ path: '/phases', message: `week ${w} is not covered by any phase` });
    if (matches.length > 1) warnings.push({ path: '/phases', message: `week ${w} is in more than one phase` });
  }

  const seenDays = new Set<string>();
  plan.days.forEach((day, d) => {
    if (seenDays.has(day.weekday)) errors.push({ path: `/days/${d}/weekday`, message: `duplicate day "${day.weekday}"` });
    seenDays.add(day.weekday);
    day.log?.forEach((f, i) => {
      if (typeof f.autofill === 'object' && !exerciseIds.has(f.autofill.maxDuration)) {
        errors.push({ path: `/days/${d}/log/${i}/autofill`, message: `unknown exercise "${f.autofill.maxDuration}"` });
      }
      f.environments?.forEach((e) => {
        if (!envIds.has(e)) errors.push({ path: `/days/${d}/log/${i}/environments`, message: `unknown environment "${e}"` });
      });
    });
    day.sessions.forEach((s, si) => {
      const sp = `/days/${d}/sessions/${si}`;
      if (!envIds.has(s.environment)) errors.push({ path: `${sp}/environment`, message: `unknown environment "${s.environment}"` });
      s.phases?.forEach((p) => {
        if (!phaseIds.has(p)) errors.push({ path: `${sp}/phases`, message: `unknown phase "${p}"` });
      });
      s.blocks.forEach((b, bi) => {
        if (typeof b === 'string') {
          if (!blockIds.has(b)) errors.push({ path: `${sp}/blocks/${bi}`, message: `unknown block "${b}"` });
        } else {
          checkBlock(b, `${sp}/blocks/${bi}`);
        }
      });
    });
    // A session must not need equipment its environment lacks (e.g. a RowErg in the hotel).
    if (!errors.length) {
      day.sessions.forEach((s, si) => {
        const env = plan.environments.find((e) => e.id === s.environment);
        if (!env) return;
        const missing = sessionEquipment(plan, s).filter((e) => !env.equipment.includes(e));
        if (missing.length) {
          warnings.push({
            path: `/days/${d}/sessions/${si}`,
            message: `${day.weekday}: needs ${missing.join(', ')}, which "${env.id}" does not have`,
          });
        }
      });
    }
    // Every (phase, environment) pair should have exactly one session for this day.
    for (const phase of plan.phases) {
      for (const env of plan.environments) {
        const n = day.sessions.filter(
          (s) => s.environment === env.id && (!s.phases || s.phases.includes(phase.id)) && !s.weeks,
        ).length;
        if (n === 0) {
          warnings.push({ path: `/days/${d}`, message: `${day.weekday}: no session for phase "${phase.id}" in "${env.id}"` });
        }
        if (n > 1) {
          warnings.push({ path: `/days/${d}`, message: `${day.weekday}: ${n} sessions for phase "${phase.id}" in "${env.id}", the first wins` });
        }
      }
    }
  });

  return { errors, warnings };
}

export function validatePlan(input: unknown): ValidationResult {
  if (!validateSchema(input)) {
    return { errors: formatAjvErrors(validateSchema.errors ?? []), warnings: [] };
  }
  const plan = input as unknown as Plan;
  const { errors, warnings } = checkReferences(plan);
  return { plan: errors.length ? undefined : plan, errors, warnings };
}

export function parseAndValidate(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { errors: [{ path: '/', message: `not valid JSON: ${(e as Error).message}` }], warnings: [] };
  }
  return validatePlan(data);
}
