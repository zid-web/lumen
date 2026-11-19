import { Loader2, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { SPEEDS } from '@/lib/tts/types';
import { appPlayer } from '@/lib/tts/player';
import { usePlayer } from '@/hooks/usePlayer';
import { useSettings } from '@/store/settings';
import { formatSpeed } from './VoiceSettings';

const PROVIDER_LABEL = { azure: 'Azure Neural', elevenlabs: 'ElevenLabs', webspeech: 'Voix du navigateur' } as const;

export function PlayerBar({ total, chapterTitle }: { total: number; chapterTitle: string }) {
  const status = usePlayer(appPlayer, (s) => s.status);
  const paragraph = usePlayer(appPlayer, (s) => s.paragraph);
  const provider = usePlayer(appPlayer, (s) => s.provider);
  const notice = usePlayer(appPlayer, (s) => s.notice);
  const speed = useSettings((s) => s.speed);
  const setSettings = useSettings((s) => s.set);

  const playing = status === 'playing';
  const loading = status === 'loading';
  const progress = total ? ((paragraph + (status === 'idle' ? 0 : 0.5)) / total) * 100 : 0;

  const cycleSpeed = () => {
    const i = SPEEDS.findIndex((s) => s === speed);
    setSettings({ speed: SPEEDS[(i + 1) % SPEEDS.length] ?? 1 });
    appPlayer.refresh();
  };

  const iconBtn = 'grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40';

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-ink/95 backdrop-blur-lg">
      <div className="h-0.5 bg-line" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="safe-bottom mx-auto max-w-3xl px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{chapterTitle}</p>
            <p className="truncate text-xs text-subtle" role="status" aria-live="polite">
              {notice ?? `§ ${Math.min(paragraph + 1, total)} / ${total}${provider && status !== 'idle' ? ` · ${PROVIDER_LABEL[provider]}` : ''}`}
            </p>
          </div>
          <button type="button" onClick={cycleSpeed} className="h-9 rounded-full border border-line px-3 text-xs font-medium tabular-nums text-muted hover:text-fg" aria-label={`Vitesse ${formatSpeed(speed)}, changer`}>
            {formatSpeed(speed)}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 sm:gap-4">
          <button type="button" className={iconBtn} onClick={() => appPlayer.stop()} disabled={status === 'idle'} aria-label="Arrêter la lecture">
            <Square className="size-4" aria-hidden />
          </button>
          <button type="button" className={iconBtn} onClick={() => appPlayer.prev()} disabled={paragraph === 0} aria-label="Paragraphe précédent">
            <SkipBack className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => appPlayer.toggle()}
            className="grid size-14 place-items-center rounded-full bg-accent text-ink shadow-[0_10px_30px_-10px_rgba(124,92,252,0.7)] transition hover:brightness-110"
            aria-label={playing || loading ? 'Mettre en pause' : 'Lire'}
          >
            {loading ? <Loader2 className="size-6 animate-spin" aria-hidden /> : playing ? <Pause className="size-6 fill-current" aria-hidden /> : <Play className="ml-0.5 size-6 fill-current" aria-hidden />}
          </button>
          <button type="button" className={iconBtn} onClick={() => appPlayer.next()} disabled={paragraph >= total - 1} aria-label="Paragraphe suivant">
            <SkipForward className="size-5" aria-hidden />
          </button>
          <span className="size-11" aria-hidden />
        </div>
      </div>
    </div>
  );
}
