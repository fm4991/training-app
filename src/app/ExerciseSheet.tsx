import { useState } from 'preact/hooks';
import { youtubeEmbedUrl } from '../device';
import type { Media, Plan } from '../types';
import { Text } from './Text';

interface Props {
  plan: Plan;
  exerciseId: string;
  onClose(): void;
  /** When set, alternatives get a "Use instead" button. */
  onSwap?(exerciseId: string): void;
  /** Open the first video right away. */
  autoplay?: boolean;
}

export function ExerciseSheet({ plan, exerciseId, onClose, onSwap, autoplay }: Props) {
  const ex = plan.exercises[exerciseId];
  const videos = (ex?.media ?? []).filter((m): m is Extract<Media, { type: 'youtube' }> => m.type === 'youtube');
  const [video, setVideo] = useState(autoplay ? videos[0] : undefined);
  if (!ex) return null;
  const embed = video && youtubeEmbedUrl(video.url, video.start);

  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={ex.name}>
        <div class="sheet-head">
          <h2>{ex.name}</h2>
          <button class="btn ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {embed && (
          <div class="video">
            <iframe
              src={embed}
              title={video.title ?? ex.name}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            {!navigator.onLine && <p class="muted small">You are offline; videos need a connection.</p>}
          </div>
        )}

        {(ex.media ?? []).map((m) =>
          m.type === 'image' ? (
            <img class="media-img" src={m.src} alt={m.alt ?? ex.name} />
          ) : m.type === 'youtube' ? (
            m !== video && (
              <button class="btn" onClick={() => setVideo(m)}>
                ▶ {m.title ?? 'Watch video'}
              </button>
            )
          ) : (
            <a class="btn" href={m.url} target="_blank" rel="noopener">
              {m.title ?? 'Open link'} ↗
            </a>
          ),
        )}

        {ex.instructions && <Text text={ex.instructions} />}
        {ex.cues && ex.cues.length > 0 && (
          <ul class="cues">
            {ex.cues.map((c) => (
              <li>{c}</li>
            ))}
          </ul>
        )}
        {ex.equipment && ex.equipment.length > 0 && (
          <div class="chips">
            {ex.equipment.map((e) => (
              <span class="chip">{plan.equipment?.[e]?.name ?? e}</span>
            ))}
          </div>
        )}
        {ex.alternatives && ex.alternatives.length > 0 && (
          <div class="alternatives">
            <h3>Alternatives</h3>
            {ex.alternatives.map((a) => (
              <div class="row between">
                <span>
                  {plan.exercises[a.exercise]?.name ?? a.exercise}
                  {a.when && <span class="muted"> if {a.when}</span>}
                </span>
                {onSwap && (
                  <button class="btn" onClick={() => onSwap(a.exercise)}>
                    Use instead
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
