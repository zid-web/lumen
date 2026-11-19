import { LANGS, SPEED_MAX, SPEED_MIN, SUPPORTED_LANGS } from '@shared/langs';
import { Range } from '@/components/ui/range';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import type { PitchLevel } from '@/lib/tts/types';
import { useSettings } from '@/store/settings';

export const formatSpeed = (v: number) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: v % 1 ? 2 : 1, maximumFractionDigits: 2 })}×`;

/** Réglages voix/langue partagés entre le lecteur et la page Réglages. */
export function VoiceSettingsForm({ onChange }: { onChange?: () => void }) {
  const s = useSettings();
  const patch = (p: Parameters<typeof s.set>[0]) => {
    s.set(p);
    onChange?.();
  };
  return (
    <div className="space-y-6">
      <Segmented
        label="Voix"
        value={s.gender}
        onChange={(gender) => patch({ gender })}
        options={[
          { value: 'female', label: 'Femme', ariaLabel: 'Voix de femme' },
          { value: 'male', label: 'Homme', ariaLabel: 'Voix d’homme' },
        ]}
      />
      <Range label="Vitesse" value={s.speed} min={SPEED_MIN} max={SPEED_MAX} step={0.25} format={formatSpeed} onChange={(speed) => patch({ speed })} />
      <Segmented<PitchLevel>
        label="Hauteur"
        value={s.pitchLevel}
        onChange={(pitchLevel) => patch({ pitchLevel })}
        options={[
          { value: 'low', label: 'Basse' },
          { value: 'medium', label: 'Moyenne' },
          { value: 'high', label: 'Haute' },
        ]}
      />
      <Select label="Ma langue" value={s.lang} onChange={(lang) => patch({ lang })} options={SUPPORTED_LANGS.map((l) => ({ value: l, label: LANGS[l].label }))} />
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-sm text-fg">Traduire dans ma langue</span>
          <span className="block text-xs text-subtle">Le livre est traduit puis lu en {LANGS[s.lang].label}.</span>
        </span>
        <input type="checkbox" role="switch" checked={s.translate} onChange={(e) => patch({ translate: e.target.checked })} className="size-5 accent-violet" />
      </label>
    </div>
  );
}
