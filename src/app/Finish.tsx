import { useMemo, useState } from 'preact/hooks';
import { dayFor, phaseForWeek, toISODate } from '../engine/resolve';
import { autofill, type RunState } from '../engine/run';
import type { Step } from '../engine/steps';
import type { LogEntry } from '../store';
import type { LogField, Plan } from '../types';
import { WEEKDAY_NAMES } from './format';

interface Props {
  plan: Plan;
  run: RunState;
  steps: Step[];
  onSave(entry: LogEntry): void;
  onBack(): void;
}

type Value = number | string | boolean | null;

export function logFieldsFor(plan: Plan, weekday: RunState['weekday'], environment: string): LogField[] {
  return (dayFor(plan, weekday)?.log ?? []).filter((f) => !f.environments || f.environments.includes(environment));
}

export function Finish({ plan, run, steps, onSave, onBack }: Props) {
  const fields = logFieldsFor(plan, run.weekday, run.environment);
  const finishedAt = useMemo(() => Date.now(), []);
  const [values, setValues] = useState<Record<string, Value>>(() => {
    const auto = autofill(fields, plan, steps, run, finishedAt);
    return Object.fromEntries(fields.map((f) => [f.id, auto[f.id] ?? (f.type === 'boolean' ? true : null)]));
  });
  const set = (id: string, v: Value) => setValues({ ...values, [id]: v });
  const minutes = Math.round((finishedAt - run.startedAt) / 60000);
  const day = dayFor(plan, run.weekday);

  const save = () =>
    onSave({
      id: run.id,
      planId: plan.id,
      date: toISODate(new Date(run.startedAt)),
      week: run.week,
      weekday: run.weekday,
      phaseId: phaseForWeek(plan, run.week)?.id,
      environment: run.environment,
      values,
      startedAt: run.startedAt,
      finishedAt,
    });

  return (
    <div class="screen finish">
      <h1>Done 💪</h1>
      <p class="muted">
        {day?.title ?? WEEKDAY_NAMES[run.weekday]} · week {run.week} · {minutes} min · {run.completed.length}/{steps.length} steps
      </p>
      <p class="small muted">Log it now, not tomorrow.</p>

      <form
        class="log-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {fields.map((f) => (
          <label class="field">
            <span>
              {f.label}
              {f.target && f.type !== 'rpe' && <span class="muted small"> (target {f.target.join('–')})</span>}
            </span>
            {f.type === 'rpe' ? (
              <Rpe value={values[f.id] as number | null} target={f.target} onChange={(v) => set(f.id, v)} />
            ) : f.type === 'boolean' ? (
              <input type="checkbox" checked={!!values[f.id]} onChange={(e) => set(f.id, e.currentTarget.checked)} />
            ) : f.type === 'number' ? (
              <div class="input-unit">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={values[f.id] === null ? '' : String(values[f.id])}
                  onInput={(e) => set(f.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
                />
                {f.unit && <span class="muted">{f.unit}</span>}
              </div>
            ) : (
              <input type="text" value={(values[f.id] as string) ?? ''} onInput={(e) => set(f.id, e.currentTarget.value)} />
            )}
          </label>
        ))}
        <button class="btn primary big" type="submit">
          Save log
        </button>
        <button class="btn ghost" type="button" onClick={onBack}>
          Back to session
        </button>
      </form>
    </div>
  );
}

function Rpe({ value, target, onChange }: { value: number | null; target?: [number, number]; onChange(v: number): void }) {
  return (
    <div class="rpe">
      <div class="rpe-scale">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            type="button"
            class={[value === n && 'active', target && n >= target[0] && n <= target[1] && 'target'].filter(Boolean).join(' ')}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div class="muted small">
        {target && `Target ${target[0] === target[1] ? target[0] : target.join('–')} · `}3–4 easy · 6–7 hard, 2–3 reps left · 8 very hard · 9–10 failure
      </div>
    </div>
  );
}
