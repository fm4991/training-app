import { useEffect, useRef, useState } from 'preact/hooks';
import { beep, keepAwake } from '../device';
import * as R from '../engine/run';
import type { Step } from '../engine/steps';
import type { Settings } from '../store';
import type { Plan } from '../types';
import { ExerciseSheet } from './ExerciseSheet';
import { clock, loadLabel, sideLabel, target } from './format';

interface Props {
  plan: Plan;
  run: R.RunState;
  steps: Step[];
  settings: Settings;
  onChange(run: R.RunState): void;
  onFinish(): void;
  onExit(): void;
  onDiscard(): void;
}

export function Player({ plan, run, steps, settings, onChange, onFinish, onExit, onDiscard }: Props) {
  const [now, setNow] = useState(Date.now());
  const [sheet, setSheet] = useState<'info' | 'video' | 'menu' | 'list'>();
  const lastBeepSecond = useRef<number>();
  const touch = useRef<{ x: number; y: number }>();
  const runRef = useRef(run);
  runRef.current = run;
  const step = steps[run.index];
  const sound = settings.sound;

  useEffect(() => {
    keepAwake(true);
    return () => keepAwake(false);
  }, []);

  useEffect(() => {
    if (R.isDone(run, steps)) onFinish();
  }, [run.index, steps.length]);

  // Clock: re-render often, and let the state machine catch up (also after the app was suspended).
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      let r = runRef.current;
      let last: R.TickEvent = 'none';
      for (let i = 0; i < 500; i++) {
        const res = R.tick(r, steps, settings, t);
        if (res.event === 'none') break;
        r = res.run;
        last = res.event;
      }
      if (last !== 'none') {
        if (sound) {
          const s = steps[r.index];
          beep(last === 'finished' || s?.kind === 'rest' ? 'end' : 'go');
        }
        lastBeepSecond.current = undefined;
        onChange(r);
        return;
      }
      // 3-2-1 countdown beeps for prep and for the end of a timed step.
      const cur = steps[r.index];
      const ms = r.clock.phase === 'prep' ? R.prepRemainingMs(r, t) : r.clock.phase === 'running' ? R.remainingMs(r, cur, t) : undefined;
      if (ms !== undefined && sound) {
        const sec = Math.ceil(ms / 1000);
        if (sec >= 1 && sec <= 3 && lastBeepSecond.current !== sec) beep('tick');
        lastBeepSecond.current = sec;
      }
    }, 100);
    return () => clearInterval(id);
  }, [steps, settings, sound]);

  if (!step) return <div class="screen center muted">Finishing…</div>;

  const s = settings;
  const go = (fn: () => R.RunState) => {
    lastBeepSecond.current = undefined;
    onChange(fn());
  };
  const onNext = () => go(() => R.next(run, steps, s, Date.now()));
  const onBack = () => go(() => R.back(run, steps, s, Date.now()));

  const timed = step.duration !== undefined;
  const remaining = R.remainingMs(run, step, now);
  const prep = run.clock.phase === 'prep' ? R.prepRemainingMs(run, now) : 0;
  const isRest = step.kind === 'rest';
  const nextEx = steps.slice(run.index + 1).find((x) => x.kind === 'exercise');
  const exercise = step.exerciseId ? plan.exercises[step.exerciseId] : undefined;
  const image = exercise?.media?.find((m) => m.type === 'image');
  const hasVideo = exercise?.media?.some((m) => m.type === 'youtube');
  const progress = run.index / steps.length;
  const side = sideLabel(step);

  // Swipe left/right to navigate.
  const onTouchStart = (e: TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = undefined;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onBack)();
  };

  return (
    <div class={`player ${isRest ? 'is-rest' : ''} ${prep ? 'is-prep' : ''}`}>
      <div class="progress">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      <header class="player-top">
        <button class="btn ghost" onClick={onExit} aria-label="Leave (keeps progress)">
          ✕
        </button>
        <button class="player-where" onClick={() => setSheet('list')}>
          <strong>{step.blockTitle}</strong>
          {step.rounds > 1 && (
            <span>
              {' '}
              · Round {step.round}/{step.rounds}
            </span>
          )}
          <span class="muted small">
            {' '}
            · {run.index + 1}/{steps.length}
          </span>
        </button>
        <button class="btn ghost" onClick={() => setSheet('menu')} aria-label="Menu">
          ⋯
        </button>
      </header>

      <main class="player-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {isRest ? (
          <div class="player-core">
            <div class="label">{step.name}</div>
            <div class="timer huge">{clock((remaining ?? 0) / 1000)}</div>
            <div class="row">
              <button class="btn" onClick={() => go(() => R.addTime(run, 15))}>
                +15 s
              </button>
            </div>
          </div>
        ) : (
          <>
            <div class="player-core">
              {side && <div class={`side side-${step.side}`}>{side}</div>}
              <h1 class="exercise-name" onClick={() => setSheet('info')}>
                {step.name}
                {exercise && <span class="info-dot">ⓘ</span>}
              </h1>
              {timed ? (
                prep ? (
                  <div class="prep">
                    <div class="label">Get ready</div>
                    <div class="timer huge">{Math.ceil(prep / 1000)}</div>
                    <div class="muted">{target(step)}</div>
                  </div>
                ) : (
                  <div class={`timer huge ${run.clock.phase === 'paused' ? 'paused' : ''}`}>{clock((remaining ?? 0) / 1000)}</div>
                )
              ) : (
                <div class="target huge">{target(step)}</div>
              )}
              <div class="chips center">
                {step.intensity && <span class="chip strong">{step.intensity}</span>}
                {step.tempo && <span class="chip">{step.tempo}</span>}
                {step.load && <span class="chip load">🎒 {loadLabel(step.load)}</span>}
              </div>
            </div>
            <div class="player-extra">
              {step.note && <p class="note">{step.note}</p>}
              {image?.type === 'image' && <img class="player-img" src={image.src} alt={image.alt ?? step.name} onClick={() => setSheet('info')} />}
              {hasVideo && (
                <button class="btn" onClick={() => setSheet('video')}>
                  ▶ Video
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {nextEx && (
        <div class="next-up">
          <span class="muted">Next:</span> {nextEx.name}
          {sideLabel(nextEx) ? ` (${sideLabel(nextEx)})` : ''} · {target(nextEx)}
          {nextEx.round !== step.round || nextEx.blockIndex !== step.blockIndex ? (
            <span class="muted small"> {nextEx.blockIndex !== step.blockIndex ? `· ${nextEx.blockTitle}` : `· round ${nextEx.round}`}</span>
          ) : null}
        </div>
      )}

      <footer class="controls">
        <button class="btn round" onClick={onBack} disabled={run.index === 0} aria-label="Back">
          ‹
        </button>
        {timed && (
          <button class="btn round" onClick={() => go(() => R.togglePause(run, Date.now()))} aria-label="Pause">
            {run.clock.phase === 'running' ? '❚❚' : '▶'}
          </button>
        )}
        <button class="btn primary next" onClick={onNext}>
          {isRest ? 'Skip rest' : timed && run.clock.phase !== 'finished' ? 'Done' : run.index === steps.length - 1 ? 'Finish' : 'Next'}
        </button>
      </footer>

      {(sheet === 'info' || sheet === 'video') && step.exerciseId && (
        <ExerciseSheet
          plan={plan}
          exerciseId={step.exerciseId}
          autoplay={sheet === 'video'}
          onClose={() => setSheet(undefined)}
          onSwap={
            step.itemKey
              ? (id) => {
                  setSheet(undefined);
                  onChange({ ...run, options: { ...run.options, swaps: { ...run.options.swaps, [step.itemKey!]: id } } });
                }
              : undefined
          }
        />
      )}

      {sheet === 'menu' && (
        <div class="sheet-backdrop" onClick={() => setSheet(undefined)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <button class="btn big" onClick={onFinish}>
              End now and log
            </button>
            <button class="btn big" onClick={onExit}>
              Leave (resume later)
            </button>
            <button class="btn big danger" onClick={() => confirm('Discard this session without logging?') && onDiscard()}>
              Discard session
            </button>
          </div>
        </div>
      )}

      {sheet === 'list' && (
        <div class="sheet-backdrop" onClick={() => setSheet(undefined)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Steps</h2>
            <ol class="step-list">
              {steps.map((st, i) => (
                <li
                  class={[i === run.index && 'current', run.completed.includes(i) && 'done', st.kind === 'rest' && 'rest'].filter(Boolean).join(' ')}
                  onClick={() => {
                    setSheet(undefined);
                    go(() => R.jumpTo(run, steps, i, s, Date.now()));
                  }}
                >
                  <span>
                    {st.name}
                    {sideLabel(st) ? ` (${sideLabel(st)})` : ''}
                  </span>
                  <span class="muted small">
                    {st.kind === 'exercise' && st.rounds > 1 ? `R${st.round} · ` : ''}
                    {target(st)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
