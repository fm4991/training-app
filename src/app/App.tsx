import { useEffect, useMemo, useState } from 'preact/hooks';
import { dayFor, findSession, positionOn } from '../engine/resolve';
import { createRun, type RunState } from '../engine/run';
import { buildSteps, type BuildOptions } from '../engine/steps';
import { unlockAudio } from '../device';
import * as store from '../store';
import type { Plan, Weekday } from '../types';
import { Finish } from './Finish';
import { History } from './History';
import { Player } from './Player';
import { Plans } from './Plans';
import { Today, type Selection } from './Today';

type View = 'today' | 'player' | 'finish' | 'history' | 'plans';

export function stepsForRun(plan: Plan, run: RunState) {
  const day = dayFor(plan, run.weekday);
  const session = day && findSession(plan, day, run.week, run.environment);
  return session ? buildSteps(plan, session, run.week, run.options) : [];
}

export function App() {
  const [plans, setPlans] = useState<store.StoredPlan[]>([]);
  const [settings, setSettings] = useState<store.Settings>(store.DEFAULT_SETTINGS);
  const [logs, setLogs] = useState<store.LogEntry[]>([]);
  const [run, setRun] = useState<RunState>();
  const [view, setView] = useState<View>('today');
  const [selection, setSelection] = useState<Selection>();
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    const [p, s, l, r] = await Promise.all([store.loadPlans(), store.loadSettings(), store.loadLogs(), store.loadRun()]);
    setPlans(p);
    setSettings(s);
    setLogs(l);
    setRun(r && p.some((x) => x.plan.id === r.planId) ? r : undefined);
    setLoaded(true);
  };

  useEffect(() => {
    void reload();
  }, []);

  const plan = useMemo(
    () => (plans.find((p) => p.plan.id === settings.activePlanId) ?? plans[0])?.plan,
    [plans, settings.activePlanId],
  );
  const runPlan = run && plans.find((p) => p.plan.id === run.planId)?.plan;
  const runSteps = useMemo(() => (run && runPlan ? stepsForRun(runPlan, run) : []), [runPlan, run?.week, run?.weekday, run?.environment, run?.options]);

  const updateSettings = (s: store.Settings) => {
    if (s.activePlanId !== settings.activePlanId) setSelection(undefined);
    setSettings(s);
    void store.saveSettings(s);
  };

  const updateRun = (r: RunState | undefined) => {
    setRun(r);
    if (r) void store.saveRun(r);
    else void store.clearRun();
  };

  const start = (week: number, weekday: Weekday, environment: string, options: BuildOptions) => {
    if (!plan) return;
    unlockAudio();
    const r = createRun({ planId: plan.id, week, weekday, environment, options }, stepsForRun(plan, { week, weekday, environment, options } as RunState), settings, Date.now());
    updateRun(r);
    setView('player');
  };

  const saveLog = async (entry: store.LogEntry) => {
    await store.addLog(entry);
    updateRun(undefined);
    setLogs(await store.loadLogs());
    setView('today');
  };

  if (!loaded) return <div class="screen center muted">Loading…</div>;

  if (view === 'player' && run && runPlan) {
    return (
      <Player
        plan={runPlan}
        run={run}
        steps={runSteps}
        settings={settings}
        onChange={updateRun}
        onFinish={() => setView('finish')}
        onExit={() => setView('today')}
        onDiscard={() => {
          updateRun(undefined);
          setView('today');
        }}
      />
    );
  }

  if (view === 'finish' && run && runPlan) {
    return <Finish plan={runPlan} run={run} steps={runSteps} onSave={saveLog} onBack={() => setView('player')} />;
  }

  return (
    <div class="app">
      <main class="screen">
        {view === 'history' ? (
          <History plans={plans.map((p) => p.plan)} logs={logs} onChange={async () => setLogs(await store.loadLogs())} />
        ) : view === 'plans' ? (
          <Plans plans={plans} activeId={plan?.id} settings={settings} onSettings={updateSettings} onChanged={reload} />
        ) : plan ? (
          <Today
            plan={plan}
            settings={settings}
            logs={logs}
            run={run}
            selection={selection ?? (() => {
              const pos = positionOn(plan, new Date());
              return { week: Math.min(Math.max(pos.week, 1), pos.totalWeeks), weekday: pos.weekday };
            })()}
            onSelect={setSelection}
            onEnvironment={(env) => updateSettings({ ...settings, environment: { ...settings.environment, [plan.id]: env } })}
            onStart={start}
            onResume={() => {
              unlockAudio();
              setView('player');
            }}
            onDiscardRun={() => updateRun(undefined)}
          />
        ) : (
          <p class="muted">No plan loaded. Import one under Plans.</p>
        )}
      </main>
      <nav class="tabbar">
        {(['today', 'history', 'plans'] as const).map((v) => (
          <button class={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {v === 'today' ? 'Today' : v === 'history' ? 'History' : 'Plans'}
          </button>
        ))}
      </nav>
    </div>
  );
}
