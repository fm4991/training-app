import { saveFile } from '../device';
import { toISODate } from '../engine/resolve';
import * as store from '../store';
import type { LogEntry } from '../store';
import { WEEKDAYS, type Plan } from '../types';
import { shortDate, WEEKDAY_NAMES } from './format';

interface Props {
  plans: Plan[];
  logs: LogEntry[];
  onChange(): void;
}

export function toCsv(plans: Plan[], logs: LogEntry[]): string {
  const fieldIds = [...new Set(logs.flatMap((l) => Object.keys(l.values)))];
  const header = ['date', 'plan', 'week', 'weekday', 'phase', 'environment', 'minutes', ...fieldIds];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...logs]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((l) => [
      l.date,
      plans.find((p) => p.id === l.planId)?.title ?? l.planId,
      l.week,
      l.weekday,
      l.phaseId ?? '',
      l.environment,
      Math.round((l.finishedAt - l.startedAt) / 60000),
      ...fieldIds.map((f) => l.values[f]),
    ]);
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export function History({ plans, logs, onChange }: Props) {
  if (!logs.length) {
    return (
      <div>
        <h1>History</h1>
        <p class="muted">No sessions logged yet. Finish a session to log it.</p>
      </div>
    );
  }

  const exportCsv = () => saveFile(`training-log-${toISODate(new Date())}.csv`, toCsv(plans, logs), 'text/csv');

  return (
    <div class="history">
      <div class="row between">
        <h1>History</h1>
        <button class="btn" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <WeeklyCheck logs={logs} plans={plans} />
      {WEEKDAYS.map((wd) => {
        const entries = logs.filter((l) => l.weekday === wd).sort((a, b) => b.startedAt - a.startedAt);
        if (!entries.length) return null;
        const plan = plans.find((p) => p.id === entries[0].planId);
        const fields = plan?.days.find((d) => d.weekday === wd)?.log ?? [];
        const fieldIds = [...new Set(entries.flatMap((e) => Object.keys(e.values)))];
        return (
          <section class="card">
            <h2>
              {WEEKDAY_NAMES[wd]}
              {plan?.days.find((d) => d.weekday === wd)?.title && <span class="muted small"> · {plan.days.find((d) => d.weekday === wd)!.title}</span>}
            </h2>
            <div class="trends">
              {fieldIds.map((id) => {
                const series = [...entries]
                  .reverse()
                  .map((e) => e.values[id])
                  .filter((v): v is number => typeof v === 'number');
                return series.length > 1 ? (
                  <div class="trend">
                    <span class="small muted">{fields.find((f) => f.id === id)?.label ?? id}</span>
                    <Sparkline values={series} />
                  </div>
                ) : null;
              })}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Wk</th>
                  {fieldIds.map((id) => (
                    <th>{fields.find((f) => f.id === id)?.label ?? id}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr>
                    <td>
                      {shortDate(new Date(e.startedAt))}
                      <div class="muted small">{e.environment}</div>
                    </td>
                    <td>{e.week}</td>
                    {fieldIds.map((id) => (
                      <td>{fmt(e.values[id])}</td>
                    ))}
                    <td>
                      <button
                        class="btn ghost small"
                        aria-label="Delete entry"
                        onClick={async () => {
                          if (!confirm('Delete this log entry?')) return;
                          await store.deleteLog(e.id);
                          onChange();
                        }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

const fmt = (v: unknown) => (v === true ? '✓' : v === false ? '✗' : v === null || v === undefined ? '–' : String(v));

/** The "Sunday check": sessions done in the latest week, and each number vs. three weeks earlier. */
function WeeklyCheck({ logs, plans }: { logs: LogEntry[]; plans: Plan[] }) {
  const latestWeek = Math.max(...logs.map((l) => l.week));
  const thisWeek = logs.filter((l) => l.week === latestWeek);
  const before = logs.filter((l) => l.week === latestWeek - 3);
  const plan = plans.find((p) => p.id === thisWeek[0]?.planId);
  const metrics = thisWeek.flatMap((l) => {
    const fields = plan?.days.find((d) => d.weekday === l.weekday)?.log ?? [];
    const old = before.find((b) => b.weekday === l.weekday);
    return fields
      .filter((f) => f.type === 'number')
      .flatMap((f) => {
        const a = l.values[f.id];
        const b = old?.values[f.id];
        return typeof a === 'number' && typeof b === 'number'
          ? [{ label: `${f.label} (${WEEKDAY_NAMES[l.weekday].slice(0, 3)})`, d: a - b, unit: f.unit ?? '' }]
          : [];
      });
  });
  return (
    <section class="card">
      <h2>Week {latestWeek}</h2>
      <p>
        <strong>{new Set(thisWeek.map((l) => l.weekday)).size}</strong> of {plan?.days.length ?? '?'} sessions done.
      </p>
      {metrics.length > 0 ? (
        <ul>
          {metrics.map((m) => (
            <li>
              {m.label}: {m.d > 0 ? '▲ +' : m.d < 0 ? '▼ ' : '= '}
              {m.d}
              {m.unit && ` ${m.unit}`} vs. week {latestWeek - 3}
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted small">Comparison with week {latestWeek - 3} appears once both weeks are logged.</p>
      )}
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 2 - ((v - min) / span) * (h - 4)}`).join(' ');
  return (
    <svg class="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`from ${values[0]} to ${values.at(-1)}`}>
      <polyline points={pts} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    </svg>
  );
}
