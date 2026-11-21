import type { TranslationProviderId } from '@shared/contracts';
import { CloudTtsProvider } from './tts/cloud';
import type { TtsProviderId } from './tts/types';

export interface ClientHealth {
  tts: TtsProviderId;
  translation: TranslationProviderId;
  sync: boolean;
  engines: ('azure' | 'elevenlabs')[];
  premiumRemaining?: number;
}

const OFFLINE: ClientHealth = { tts: 'webspeech', translation: 'none', sync: false, engines: [] };
let current: ClientHealth = OFFLINE;
let cloud: CloudTtsProvider | null = null;
let inflight: Promise<ClientHealth> | null = null;

/** Interroge /api/health (mis en cache par le SW en NetworkFirst). */
export function fetchHealth(): Promise<ClientHealth> {
  inflight ??= fetch('/api/health', { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`health ${r.status}`);
      const d = (await r.json()) as Partial<ClientHealth>;
      const tts: TtsProviderId = d.tts === 'azure' || d.tts === 'elevenlabs' ? d.tts : 'webspeech';
      const translation: TranslationProviderId = d.translation === 'deepl' || d.translation === 'azure' ? d.translation : 'none';
      const engines = Array.isArray(d.engines) ? d.engines.filter((e): e is 'azure' | 'elevenlabs' => e === 'azure' || e === 'elevenlabs') : [];
      return { tts, translation, sync: d.sync === true, engines, ...(typeof d.premiumRemaining === 'number' ? { premiumRemaining: d.premiumRemaining } : {}) };
    })
    .catch(() => OFFLINE)
    .then((h) => {
      current = h;
      cloud = h.tts === 'webspeech' ? null : new CloudTtsProvider(h.tts);
      inflight = null;
      return h;
    });
  return inflight;
}

export const health = () => current;
export const cloudProvider = () => cloud;
