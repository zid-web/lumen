import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Square } from 'lucide-react';
import { LANGS, type VoiceGender } from '@shared/langs';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { usePlayer } from '@/hooks/usePlayer';
import { DEMO_LANGS, DEMO_TEXT, type DemoLang } from '@/lib/demo';
import { cloudProvider, fetchHealth } from '@/lib/health';
import type { TtsEngine } from '@/lib/tts/types';
import { TtsController } from '@/lib/tts/controller';
import { HighlightedText } from '@/components/HighlightedText';

const PROVIDER_LABEL = { azure: 'Azure Neural', elevenlabs: 'ElevenLabs', webspeech: 'Voix du navigateur' } as const;

export function VoiceDemo() {
  const [gender, setGender] = useState<VoiceGender>('female');
  const [lang, setLang] = useState<DemoLang>(() => {
    const l = navigator.language.slice(0, 2) as DemoLang;
    return DEMO_LANGS.includes(l) ? l : 'fr';
  });
  const [engines, setEngines] = useState<('azure' | 'elevenlabs')[]>([]);
  const [engine, setEngine] = useState<TtsEngine>('auto');
  const genderRef = useRef(gender);
  genderRef.current = gender;
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const controller = useMemo(
    () => new TtsController({ getVoice: () => ({ gender: genderRef.current, speed: 1, pitch: 0, engine: engineRef.current }), getCloud: cloudProvider }),
    [],
  );

  const status = usePlayer(controller, (s) => s.status);
  const word = usePlayer(controller, (s) => s.word);
  const provider = usePlayer(controller, (s) => s.provider);
  const notice = usePlayer(controller, (s) => s.notice);
  const text = DEMO_TEXT[lang];

  useEffect(() => {
    void fetchHealth().then((h) => setEngines(h.engines));
    return () => controller.destroy();
  }, [controller]);

  useEffect(() => {
    controller.setQueue({ id: `demo-${lang}`, paragraphs: [text], lang, title: 'Démo Lumen', artist: 'Lumen', album: 'Démo' });
  }, [controller, lang, text]);

  // Changer de voix pendant la lecture relance immédiatement.
  useEffect(() => controller.refresh(), [controller, gender, engine]);

  const active = status === 'playing' || status === 'loading';

  return (
    <div className="rounded-3xl border border-line bg-surface/80 p-5 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Segmented
          label="Voix"
          value={gender}
          onChange={setGender}
          options={[
            { value: 'female', label: 'Femme', ariaLabel: 'Voix de femme' },
            { value: 'male', label: 'Homme', ariaLabel: 'Voix d’homme' },
          ]}
        />
        <Select label="Langue" value={lang} onChange={setLang} options={DEMO_LANGS.map((l) => ({ value: l, label: LANGS[l].label }))} />
        <Button
          size="lg"
          onClick={() => (active ? controller.stop() : void controller.play(0))}
          aria-label={active ? 'Arrêter la démo' : 'Écouter la démo'}
          className="w-full sm:w-auto"
        >
          {status === 'loading' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : active ? <Square className="size-4 fill-current" aria-hidden /> : <Play className="size-5 fill-current" aria-hidden />}
          {active ? 'Arrêter' : 'Écouter'}
        </Button>
      </div>

      {engines.length > 1 && (
        <Segmented<TtsEngine>
          label="Moteur"
          className="mt-4"
          value={engine === 'auto' ? (engines[0] ?? 'azure') : engine}
          onChange={setEngine}
          options={[
            { value: 'azure', label: 'Azure', ariaLabel: 'Comparer avec Azure Neural' },
            { value: 'elevenlabs', label: 'ElevenLabs ✦', ariaLabel: 'Comparer avec ElevenLabs' },
          ]}
        />
      )}

      <p lang={lang} className="mt-7 text-lg leading-relaxed text-fg/90 sm:text-xl">
        <HighlightedText text={text} word={active ? word : null} />
      </p>

      <p className="mt-5 min-h-5 text-xs text-subtle" role="status" aria-live="polite">
        {notice ?? (provider && active ? `Lecture : ${PROVIDER_LABEL[provider]}` : '')}
      </p>
    </div>
  );
}
