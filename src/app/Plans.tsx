import { useState } from 'preact/hooks';
import schema from '../../spec/training-plan.schema.json';
import specMd from '../../spec/SPEC.md?raw';
import { saveFile } from '../device';
import { toISODate } from '../engine/resolve';
import { parseAndValidate, validatePlan, type Issue } from '../engine/validate';
import * as store from '../store';
import type { Settings, StoredPlan } from '../store';

interface Props {
  plans: StoredPlan[];
  activeId?: string;
  settings: Settings;
  onSettings(s: Settings): void;
  onChanged(): void;
}

export function Plans({ plans, activeId, settings, onSettings, onChanged }: Props) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [message, setMessage] = useState('');

  const importText = async (json: string) => {
    setMessage('');
    const r = parseAndValidate(json);
    setErrors(r.errors);
    setWarnings(r.warnings);
    if (!r.plan) return;
    const existing = plans.find((p) => p.plan.id === r.plan!.id);
    if (existing && !existing.builtin && !confirm(`Replace the existing plan "${existing.plan.title}"?`)) return;
    await store.savePlan(r.plan);
    onSettings({ ...settings, activePlanId: r.plan.id });
    setText('');
    setMessage(`Imported "${r.plan.title}".`);
    onChanged();
  };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await importText(await file.text());
  };

  const backup = async () => saveFile(`training-backup-${toISODate(new Date())}.json`, JSON.stringify(await store.exportBackup(), null, 2), 'application/json');

  const restore = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !confirm('Restore replaces all plans, logs and settings on this device. Continue?')) return;
    try {
      const data = JSON.parse(await file.text()) as store.Backup;
      const bad = (data.plans ?? []).filter((p) => validatePlan(p.plan).errors.length);
      if (bad.length) throw new Error(`invalid plan(s): ${bad.map((p) => p.plan?.id).join(', ')}`);
      await store.restoreBackup(data);
      setMessage(`Restored ${data.logs.length} log entries and ${data.plans.length} imported plans.`);
      onChanged();
    } catch (err) {
      setMessage(`Restore failed: ${(err as Error).message}`);
    }
  };

  const copySpec = async () => {
    const content = `${specMd}\n\n## JSON Schema\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n`;
    try {
      await navigator.clipboard.writeText(content);
      setMessage('Spec + schema copied. Paste it into an LLM together with your training PDF.');
    } catch {
      await saveFile('training-plan-spec.md', content, 'text/markdown');
    }
  };

  return (
    <div class="plans">
      <h1>Plans</h1>
      {message && <p class="message">{message}</p>}

      <section class="card">
        {plans.map(({ plan, builtin, importedAt }) => (
          <div class="plan-row">
            <label>
              <input type="radio" name="active" checked={plan.id === activeId} onChange={() => onSettings({ ...settings, activePlanId: plan.id })} />
              <span>
                <strong>{plan.title}</strong>
                <div class="muted small">
                  {builtin ? 'Built-in' : `Imported ${importedAt.slice(0, 10)}`} · starts {plan.startDate}
                </div>
              </span>
            </label>
            {!builtin && (
              <button
                class="btn ghost small"
                onClick={async () => {
                  if (!confirm(`Delete "${plan.title}"? Logs are kept.`)) return;
                  await store.deletePlan(plan.id);
                  onChanged();
                }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </section>

      <section class="card">
        <h2>Import a plan</h2>
        <label class="btn">
          Choose JSON file…
          <input type="file" accept="application/json,.json" hidden onChange={onFile} />
        </label>
        <p class="muted small">…or paste the JSON:</p>
        <textarea rows={6} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder='{ "specVersion": 1, … }' />
        <button class="btn primary" disabled={!text.trim()} onClick={() => importText(text)}>
          Import pasted JSON
        </button>
        <Issues title="Errors" issues={errors} />
        <Issues title="Warnings" issues={warnings} />
        <button class="btn ghost" onClick={copySpec}>
          Copy spec for an LLM
        </button>
      </section>

      <section class="card">
        <h2>Settings</h2>
        <Toggle label="Sound (beeps, 3-2-1 countdown)" checked={settings.sound} onChange={(v) => onSettings({ ...settings, sound: v })} />
        <Toggle label="Auto-advance timed exercises" checked={settings.autoAdvance} onChange={(v) => onSettings({ ...settings, autoAdvance: v })} />
        <label class="field row between">
          <span>"Get ready" before timed exercises</span>
          <select value={settings.prepSeconds} onChange={(e) => onSettings({ ...settings, prepSeconds: Number(e.currentTarget.value) })}>
            {[0, 3, 5, 10].map((n) => (
              <option value={n}>{n ? `${n} s` : 'off'}</option>
            ))}
          </select>
        </label>
      </section>

      <section class="card">
        <h2>Backup</h2>
        <p class="muted small">Plans and logs live only on this device. Back up now and then.</p>
        <div class="row">
          <button class="btn" onClick={backup}>
            Export backup
          </button>
          <label class="btn">
            Restore…
            <input type="file" accept="application/json,.json" hidden onChange={restore} />
          </label>
        </div>
      </section>
      <p class="muted small center">Training Player {__APP_VERSION__}</p>
    </div>
  );
}

function Issues({ title, issues }: { title: string; issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <div class={`issues ${title.toLowerCase()}`}>
      <strong>
        {title} ({issues.length})
      </strong>
      <ul>
        {issues.slice(0, 50).map((i) => (
          <li>
            <code>{i.path}</code> {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label class="field row between">
      <span>{label}</span>
      <input type="checkbox" class="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}
