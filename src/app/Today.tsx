import { useState } from 'preact/hooks';
import { dateOf, dayFor, findSession, phaseForWeek, positionOn, resolveBlocks, resolveNum, sessionEquipment, toISODate } from '../engine/resolve';
import type { RunState } from '../engine/run';
import { buildSteps, estimateSeconds, type BuildOptions } from '../engine/steps';
import type { LogEntry, Settings } from '../store';
import { isChoice, WEEKDAYS, type Item, type Plan, type Weekday } from '../types';
import { duration, shortDate, WEEKDAY_NAMES, WEEKDAY_SHORT } from './format';
import { ExerciseSheet } from './ExerciseSheet';
import { Text } from './Text';

export interface Selection {
  week: number;
  weekday: Weekday;
}

interface Props {
  plan: Plan;
  settings: Settings;
  logs: LogEntry[];
  run?: RunState;
  selection: Selection;
  onSelect(s: Selection): void;
  onEnvironment(id: string): void;
  onStart(week: number, weekday: Weekday, environment: string, options: BuildOptions): void;
  onResume(): void;
  onDiscardRun(): void;
}

export function Today({ plan, settings, logs, run, selection, onSelect, onEnvironment, onStart, onResume, onDiscardRun }: Props) {
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [info, setInfo] = useState<string>();
  const now = new Date();
  const pos = positionOn(plan, now);
  const { week, weekday } = selection;
  const env = plan.environments.find((e) => e.id === settings.environment[plan.id]) ?? plan.environments[0];
  const phase = phaseForWeek(plan, week);
  const day = dayFor(plan, weekday);
  const session = day && findSession(plan, day, week, env.id);
  const date = dateOf(plan, week, weekday);
  const isToday = toISODate(date) === toISODate(now);
  const logged = logs.filter((l) => l.planId === plan.id && l.week === week && l.weekday === weekday);
  const trainingDays = WEEKDAYS.filter((d) => dayFor(plan, d));
  const options = { choices };
  const steps = session ? buildSteps(plan, session, week, options) : [];
  const equipment = session ? sessionEquipment(plan, session) : [];
  const runDay = run && dayFor(plan, run.weekday);

  return (
    <div class="today">
      <header class="plan-header">
        <h1>{plan.title}</h1>
        {plan.subtitle && <p class="muted">{plan.subtitle}</p>}
        <p class="status">
          {pos.status === 'before' && `Starts in ${pos.daysUntilStart} day${pos.daysUntilStart === 1 ? '' : 's'}`}
          {pos.status === 'after' && 'Plan finished. Enjoy the trip!'}
          {pos.status === 'active' && `Today: week ${pos.week} of ${pos.totalWeeks}${pos.phase ? ` · ${pos.phase.name}` : ''}`}
        </p>
      </header>

      {run && run.planId === plan.id && (
        <div class="card resume">
          <div>
            <strong>Session in progress</strong>
            <div class="muted">
              {runDay?.title ?? WEEKDAY_NAMES[run.weekday]} · week {run.week}
            </div>
          </div>
          <div class="row">
            <button class="btn ghost" onClick={() => confirm('Discard the session in progress?') && onDiscardRun()}>
              Discard
            </button>
            <button class="btn primary" onClick={onResume}>
              Resume
            </button>
          </div>
        </div>
      )}

      <div class="segmented" role="tablist">
        {plan.environments.map((e) => (
          <button class={e.id === env.id ? 'active' : ''} onClick={() => onEnvironment(e.id)}>
            {e.name}
          </button>
        ))}
      </div>

      <div class="week-picker">
        <button class="btn ghost" disabled={week <= 1} onClick={() => onSelect({ week: week - 1, weekday })} aria-label="Previous week">
          ‹
        </button>
        <div class="center">
          <strong>Week {week}</strong>
          <div class="muted small">{phase?.name}</div>
        </div>
        <button class="btn ghost" disabled={week >= pos.totalWeeks} onClick={() => onSelect({ week: week + 1, weekday })} aria-label="Next week">
          ›
        </button>
      </div>

      <div class="day-picker">
        {WEEKDAYS.map((d) => {
          const isTrainingDay = trainingDays.includes(d);
          const done = logs.some((l) => l.planId === plan.id && l.week === week && l.weekday === d);
          const today = toISODate(dateOf(plan, week, d)) === toISODate(now);
          return (
            <button
              class={[d === weekday && 'active', !isTrainingDay && 'rest', today && 'today', done && 'done'].filter(Boolean).join(' ')}
              onClick={() => {
                setChoices({});
                onSelect({ week, weekday: d });
              }}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          );
        })}
      </div>

      <section class="card session">
        <div class="muted small">
          {isToday ? 'Today' : shortDate(date)} · {WEEKDAY_NAMES[weekday]}
          {logged.length > 0 && <span class="badge ok">✓ logged</span>}
        </div>
        {!day ? (
          <>
            <h2>Rest day</h2>
            <p class="muted">Nothing planned. Recover.</p>
          </>
        ) : !session ? (
          <>
            <h2>{day.title}</h2>
            <p class="muted">No session for {env.name} in this week.</p>
          </>
        ) : (
          <>
            <h2>{day.title}</h2>
            {day.subtitle && <p class="subtitle">{day.subtitle}</p>}
            {day.why && <Text class="why" text={day.why} />}
            {phase?.focus && (
              <p class="small">
                <strong>{phase.name}:</strong> {phase.focus}
              </p>
            )}
            {session.note && <p class="note">{session.note}</p>}

            {equipment.length > 0 && (
              <div class="chips">
                {equipment.map((e) => (
                  <span class="chip">{plan.equipment?.[e]?.name ?? e}</span>
                ))}
              </div>
            )}

            <ol class="blocks">
              {resolveBlocks(plan, session).map((b, bi) => {
                const rounds = resolveNum(b.rounds, week) ?? 1;
                const rest = resolveNum(b.restBetweenRounds, week);
                return (
                  <li>
                    <div class="block-head">
                      <strong>{b.title}</strong>
                      <span class="muted small">
                        {rounds > 1 && `${rounds} rounds`}
                        {rest ? ` · ${duration(rest)} rest` : ''}
                      </span>
                    </div>
                    {b.note && <div class="note small">{b.note}</div>}
                    <ul>
                      {b.items.map((entry, ii) => {
                        const key = `${bi}.${ii}`;
                        if (isChoice(entry)) {
                          return (
                            <li class="choice">
                              <span class="muted small">{entry.label ?? 'Choose one'}:</span>
                              {entry.choice.map((c, ci) => (
                                <label>
                                  <input
                                    type="radio"
                                    name={key}
                                    checked={(choices[key] ?? 0) === ci}
                                    onChange={() => setChoices({ ...choices, [key]: ci })}
                                  />{' '}
                                  {c.label ?? plan.exercises[c.exercise]?.name} · {itemTarget(c, week)}
                                </label>
                              ))}
                            </li>
                          );
                        }
                        return (
                          <li>
                            <button class="link" onClick={() => setInfo(entry.exercise)}>
                              {entry.label ?? plan.exercises[entry.exercise]?.name}
                            </button>{' '}
                            <span class="muted">{itemTarget(entry, week)}</span>
                            {entry.onlyRounds && <span class="muted small"> (rounds {entry.onlyRounds.join(', ')})</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>

            <button class="btn primary big" onClick={() => onStart(week, weekday, env.id, options)}>
              Start · ~{Math.round(estimateSeconds(steps) / 60)} min
            </button>
          </>
        )}
      </section>

      {phase?.notes && (
        <details class="card">
          <summary>
            Phase {plan.phases.indexOf(phase) + 1}: {phase.name}
          </summary>
          <p>{phase.notes}</p>
        </details>
      )}
      {plan.notes && plan.notes.length > 0 && (
        <details class="card">
          <summary>Plan notes</summary>
          {plan.description && <Text text={plan.description} />}
          <ul>
            {plan.notes.map((n) => (
              <li>{n}</li>
            ))}
          </ul>
        </details>
      )}

      {info && <ExerciseSheet plan={plan} exerciseId={info} onClose={() => setInfo(undefined)} />}
    </div>
  );
}

function itemTarget(item: Item, week: number): string {
  const parts: string[] = [];
  const reps = resolveNum(item.reps, week);
  const dur = resolveNum(item.duration, week);
  if (reps !== undefined) parts.push(`${reps}${item.perSide ? '/side' : ''}`);
  if (dur !== undefined) parts.push(`${duration(dur)}${item.perSide ? '/side' : ''}`);
  if (item.load) {
    const kg = resolveNum(item.load.kg, week);
    parts.push(item.load.kgMax ? `${kg}–${item.load.kgMax} kg` : `${kg} kg`);
  }
  return parts.join(' · ');
}
