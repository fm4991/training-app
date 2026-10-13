// Thin wrappers around browser APIs that behave differently on iOS.

let ctx: AudioContext | undefined;

/** Must be called from a user gesture (iOS only allows audio after one). */
export function unlockAudio(): void {
  try {
    // Mix with music instead of pausing it (Safari 17+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    // A silent buffer fully unlocks output on older iOS versions.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start();
  } catch {
    // No audio is not fatal.
  }
}

export type Beep = 'tick' | 'go' | 'end';

const BEEPS: Record<Beep, { freq: number; ms: number }> = {
  tick: { freq: 880, ms: 120 },
  go: { freq: 1320, ms: 350 },
  end: { freq: 660, ms: 500 },
};

export function beep(kind: Beep): void {
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const { freq, ms } = BEEPS[kind];
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.05);
}

type WakeLockSentinel = { release(): Promise<void>; released: boolean };
let lock: WakeLockSentinel | undefined;
let wanted = false;

async function acquire() {
  const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinel> } }).wakeLock;
  if (!wl || document.visibilityState !== 'visible') return;
  try {
    lock = await wl.request('screen');
  } catch {
    // Denied (e.g. low power mode); the timer still works from timestamps.
  }
}

function onVisibility() {
  if (wanted && (!lock || lock.released)) void acquire();
}

/** Keeps the screen on while a session runs. The lock is lost when the page is hidden, so re-acquire on return. */
export function keepAwake(on: boolean): void {
  wanted = on;
  if (on) {
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
  } else {
    document.removeEventListener('visibilitychange', onVisibility);
    void lock?.release();
    lock = undefined;
  }
}

/** Saves a file: share sheet where available (works in iOS home-screen apps), download otherwise. */
export async function saveFile(name: string, content: string, type: string): Promise<void> {
  const file = new File([content], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function youtubeEmbedUrl(url: string, start?: number): string | undefined {
  const m =
    url.match(/youtu\.be\/([\w-]{11})/) ??
    url.match(/[?&]v=([\w-]{11})/) ??
    url.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
  if (!m) return undefined;
  const params = new URLSearchParams({ playsinline: '1', rel: '0' });
  const t = start ?? Number(new URL(url).searchParams.get('t')?.replace(/s$/, '') || 0);
  if (t) params.set('start', String(t));
  return `https://www.youtube-nocookie.com/embed/${m[1]}?${params}`;
}
